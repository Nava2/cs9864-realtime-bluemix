'use strict';

const assert  = require('assert');
const util    = require('util');
const fs      = require('fs');
const spawn = require('child_process').spawn;

const _       = require('lodash');
const csv     = require('csv-stream');
const moment  = require('moment');
const sqlite3 = require('sqlite3').verbose();
const w = require('winston');

const ref = require('./ref');

const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['clean-db', 'nuke-db', 'quiet'],
  alias: {
    'quiet': ['q']
  },
  default: {
    db: './stock-data-test.db',
    'clean-db': true,
    'nuke-db': false,
    'chunk-size': 500000,
    quiet: false,
    'log-level': 'debug'
  }
});

if (argv.quiet) {
  w.level = 'warn';
} else {
  w.level = argv['log-level'];
}

w.debug('CLI Args:', util.inspect(argv, { depth: 1, colors: true }));

const CFG = {
  dir:        argv.dir,
  db_name:    argv.db,
  clean_db:   argv['clean-db'],
  nuke_db:    argv['nuke-db'],
  chunk_size: argv['chunk-size'],
  date:       moment(argv._[0], 'YYYY-MM-DD')
};
w.debug('CFG =', util.inspect(CFG, { depth: 1, colors: true }));

assert(CFG.dir, "`dir` parameter must be specified on the command line.");
assert(CFG.db_name, "`db` parameter must be specified on the command line.");
assert(CFG.date, "Date to extract must be specified on the command line.");

w.info(util.format("Reading from %s, storing into %s", CFG.dir, CFG.db_name));

function handleErr(err) {
  if (!!err) {
    throw err;
  }
}

function init_db(db, next) {
  if (!db) {
    throw new Error('db was invalid.');
  }

  w.debug("Initializing database:", CFG.db_name);

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('CREATE TABLE tickers (id INTEGER PRIMARY KEY ASC'
      + ', ticker VARCHAR(10) UNIQUE'
      + ')', handleErr);

    db.run('CREATE TABLE exchanges (id CHARACTER PRIMARY KEY'
      + ', name VARCHAR(100)'
      + ')');

    const exch_stmt = db.prepare('INSERT INTO exchanges VALUES ($id, $name)');
    ref.EXCHANGES.forEach((exch) => {
      exch_stmt.run({
        $id: exch.id,
        $name: exch.name
      });
    });
    exch_stmt.finalize();

    db.run('CREATE TABLE conditions (exchange_id CHARACTER REFERENCES exchanges (id)'
      + ', code CHARACTER NOT NULL'
      + ', long_note VARCHAR(50) NOT NULL'
      + ', PRIMARY KEY (exchange_id, code)'
      + ')');

    const condition_stmt = db.prepare('INSERT OR IGNORE INTO conditions VALUES ($exch_id, $code, $note)');
    ref.CONDITIONS.forEach((cond) => {
      cond.exch.forEach((ex) => {
        if (ex === '*') {
          // ADD FOR ALL
          ref.EXCHANGES.forEach((ex) => {
            condition_stmt.run({
              $exch_id: ex.id,
              $code: cond.code,
              $note: cond.long
            });
          });
        } else {
          condition_stmt.run({
            $exch_id: ex,
            $code: cond.code,
            $note: cond.long
          });
        }
      });
    });
    condition_stmt.finalize();

    db.run('COMMIT');
  });

  next({ db: db });
}

// Simple callback for creating a db
function create_db(next) {
  w.info("Creating a new Database");
  // Create a new 'db' database.

  const db = new sqlite3.Database(CFG.db_name);

  init_db(db, next);
}

function clean_db(info, next) {
  w.info("Cleaning Database");
  const db = info.db;
  const $date = info.date.format('YYYYMMDD');

  db.run(`SELECT 1 FROM trans_${$date}`, err => {
    if (!err) {
      db.run(`DELETE FROM trans_${$date} WHERE 1=1`, handleErr);
    }
  });

  if (_.isFunction(next)) {
    next(_.extend(info, { $date: $date }));
  }
}

function delete_db(next) {
  w.info("Nuking Database");
  fastDeleteFolder(CFG.db_name, () => {
    create_db(next);
  });
}

// Concert a csv to a doc format
/**
 * Streams a CSV file and runs the `perRow` function against all rows.
 * @param info Information about the running file
 * @callback perRow Called once per row
 * @callback next Called when the file stream ends
 */
const stream_csv = (() => {

  const TICKER_REG = /(\w+)(?:\.csv)/;
  return function (info, perRow, next) {
    w.silly(util.format("stream_csv: %s", info.path));

    info.ticker = TICKER_REG.exec(info.file)[1];
    info.path = './' + info.date.format('YYYYMMDD') + '/' + info.file;

    var csvStream = csv.createStream({
      columns : [
        'time', 'price'
        , 'size', 'exchange_id'
        , 'condition', 'suspicious'
      ]
    });
    var cnt = 0;
    fs.createReadStream(info.path)
      .pipe(csvStream)
      .on('error', err => {
        handleErr(err);
      })
      .on('data', (data) => {
        perRow(data);
        cnt++;
      })
      .on('end', () => {
        // the stream is done being read
        w.silly('Finished reading', info.path);

        next(_.extend(info, { count: cnt }));
      });
  };
})();

function fastDeleteFolder(folder, next) {
  fs.stat(folder, (err, stat) => {
    // if (!!err)
    //   throw err;

    if (!!stat) {
      if (stat.isFile() || stat.isDirectory()) {
        // the file exists
        let cmd = spawn('rm', ['-rf', folder]);
        cmd.on('error', handleErr);
        cmd.on('close', (code) => {
          if (code != 0) {
            onErr('Failed to rm -rf: code=' + code);
          }

          next();
        });
      }
    } else {
      next();
    }

  });
}

function processRarContent(info, next, files) {
  // files is all of the CSV files :D
  files.slice(0, 40).forEach((f, idx) => {
    w.silly(util.format('%s [%d/%d] -> %s', info.folder, idx, files.length, f));
  });
  if (files.length > 40) {
    w.silly(util.format('... %d more files extracted'), files.length - 40);
  }

  let row_count = 0;
  let total_count = 0;

  const db = info.db;
  const $date = info.date.format('YYYYMMDD');

  let next_wrap = (info) => {
    if (row_count > 0) {
      db.serialize(() => {
        db.run(`CREATE INDEX trans_${$date}_time ON trans_${$date} (time)`);
        db.run("COMMIT");

        w.debug("COMMITTED LAST ROWS");
      });
    }

    if (_.isFunction(next)) {
      next(info);
    }
  };

  function run_file(idx) {
    if (idx >= files.length) {
      next_wrap(info);
      return;
    }

    let file = files[idx];

    w.debug('Loading file =', file);

    info.ticker = /(\w+)\.csv/.exec(file)[1];

    const stmt = info.db.prepare(`INSERT INTO trans_${$date} (` +
      '  ticker_id' +
      ', time' +
      ', price' +
      ', size' +
      ', exchange_id' +
      ', condition_code' +
      ', suspicious)' +

      ' VALUES ('
      + '  (SELECT id FROM tickers WHERE ticker=$ticker)'
      + ', $time'
      + ', $price'
      + ', $size'
      + ', $exchange_id'
      + ', $condition_code'
      + ', $suspicious)');

    function perRow(data) {
      const row = {
        $ticker: info.ticker,
        $time: info.date.clone().add(data.time, 'ms').format('HH:mm:ss'),
        $price: Number(data.price),
        $size: Number(data.size),
        $exchange_id: data.exchange_id,
        $condition_code: data.condition,
        $suspicious: Number(data.suspicious)
      };

      stmt.run(row, err => {
        if (!!err) {
          w.warn('Failed to run statement:', data, row);
          handleErr(err);
        }
      });
    }

    try {

      info.db.serialize(() => {

        if (row_count == 0) {
          info.db.run('BEGIN TRANSACTION');
        }

        info.db.run('INSERT OR IGNORE INTO tickers(ticker) VALUES (?)', info.ticker);

        stream_csv(_.extend(info, {file: file}), perRow, info => {
          stmt.finalize(err => {
            handleErr(err);

            w.debug(util.format("Loaded file[%d/%d]: %s (%d rows)", idx + 1, files.length, info.file, info.count));

            let next = () => {
              _.defer(run_file, idx + 1);
            };

            // the row_count has an off by one, but its irrelevant since this is just for bookkeeping, it also
            // stops the transaction being started again if there were no rows... so lesser of two evils in a
            // hack?
            row_count += 1 + info.count;
            total_count += info.count - 1; // "correct" the off-by-one

            if (row_count >= CFG.chunk_size * 0.95) {
              w.debug('COMMIT ', row_count, ':', total_count);
              // commit the transaction
              info.db.run('COMMIT', err => {
                handleErr(err);
                row_count = 0;
                next();
              });
            } else {
              next();
            }


          });
        });
      });
    } catch (err) {
      handleErr(err);
    }
  }


  // Create the table then run the files through inserting them, this way the table will exist
  db.run(`CREATE TABLE IF NOT EXISTS trans_${$date} (id INTEGER PRIMARY KEY`
    + ', ticker_id INTEGER REFERENCES tickers (id)'
    + ', time VARCHAR(8) NOT NULL'
    + ', price INTEGER NOT NULL'
    + ', size BIGINT NOT NULL'
    + ', exchange_id CHARACTER REFERENCES exchanges (id)'
    + ', condition_code CHARACTER REFERENCES conditions (code)'
    + ', suspicious BOOLEAN NOT NULL DEFAULT 0'
    + ')', err => {
    handleErr(err);

    run_file(0);
  });
}

// Process a RAR file, unrar it then return an aggregated promise against all files
// Additionally, it removes the unrar'd files after
function processRar(info, next) {

  const folder = './' + CFG.date.format('YYYYMMDD');

  info = _.extend(info, {
    date: CFG.date,
    folder: folder,
    rar_path: CFG.dir + '/' + info.rar_file
  });

  const command = util.format('unrar x -inul %s', info.rar_path);
  w.debug("Unrar command =>", command);

  function onErr(err) {
    if (!err) {
      // let the method be called and do nothing if there's no error
      return ;
    }

    fastDeleteFolder(folder, () => { handleErr(err); });
  }

  fastDeleteFolder(folder, () => {
    w.debug('unraring', info.rar_file, '...');
    let cmd = spawn('unrar', ['x', '-inul', info.rar_path]);
    cmd.on('error', onErr);
    cmd.on('close', (code) => {
      if (code != 0) {
        onErr('unrar failed with ' + code);
      }

      w.debug('... unrar\'d', info.rar_file);

      // Successfully unrar'd

      fs.readdir(folder, (err, files) => {
        onErr(err);

        processRarContent(info, next, files);

      });
    }); // cmd 'close'
  });

}


function process_data(info) {
  processRar(_.extend(info, {
      rar_file: CFG.date.format('YYYYMMDD[.rar]')
    }),
      (info, next) => {
        w.info("Finished processing?", info);
      });// end process_rar
}

(() => {

  if (CFG.nuke_db) {
    delete_db(process_data);
  } else {

    fs.stat(CFG.db_name, (err, stats) => {
        if (!err && stats.isFile()) {
          // database exists
          let info = {
            db: new sqlite3.Database(CFG.db_name),
            date: CFG.date
          };

          if (CFG.clean_db) {
            clean_db(info, process_data);
          } else {
            process_data(info);
          }
        } else {
          // db doesn't exist
          create_db(process_data);
        }
      });
  }

})();





