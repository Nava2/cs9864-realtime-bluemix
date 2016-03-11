'use strict';

const unirest = require('unirest');
const util    = require('util');
const _       = require('lodash');
const assert  = require('assert');
const parse   = require('csv-parse');
const fs      = require('fs');

const Cloudant = require('cloudant');
const cloudant_cred = require('../cloudant.json').credentials;
const cloudant = Cloudant(cloudant_cred.url);

const spawn = require('child_process').spawn;

const argv = require('minimist')(process.argv.slice(2), {
  default: {
    db: 'stock-data-test',
    'clean-db': false,
    'process-chunk-size': 10,
    'api-chunk-size': 50000
  }
});


console.log(argv);
assert(argv.dir, "`dir` parameter must be specified on the command line.");
assert(argv.db, "`db` parameter must be specified on the command line.")

const dir                 = argv.dir;
const db_name             = argv.db;
const clean_db            = argv['clean-db'];
const PROCESS_CHUNK_SIZE  = argv['process-chunk-size'];
const API_CHUNK_SIZE      = argv['api-chunk-size'];

console.log(util.format("Reading from %s, storing into %s:%s", dir, cloudant_cred.host, db_name));

function handleErr(err) {
  if (!!err) {
    throw err;
  }
}

// Simple callback for creating a db
function create_db(next, errcb) {
  // Create a new 'db' database.
  cloudant.db.create(db_name, function(err) {
    if (!!err) {
      errcb(err);
    } else {

      // Specify the database we are going to use (alice)...
      let db = cloudant.db.use(db_name);

      next(db);
    }

  });
}

function delete_db(next, errcb) {
  cloudant.db.destroy(db_name, function (err) {
    if (!!err) {
      errcb(err);
    }

    next();
  });
}

// Process a RAR file, unrar it then return an aggregated promise against all files
// Additionally, it removes the unrar'd files after
function processRar(rarFile, proc) {

  const date = /(\d{8})\.rar/.exec(rarFile)[1];
  const folder = './' + date;
  const command = util.format('unrar x -inul %s', dir + rarFile);
  console.log("command =>", command);

  function onErr(err) {
    if (!err) {
      // let the method be called and do nothing if there's no error
      return ;
    }

    try {
      fs.access(folder); // if this throws, it doesn't exist
      fs.rmdirSync(folder);
    } catch (e) { }
    

    throw err;
  }

  fs.stat(folder, (err, stat) => {
    // if (!!err) 
    //   throw err;

    if (!!stat) {
      if (stat.isFile()) {
        // the file exists
        fs.unlinkSync(folder);
      } else if (stat.isDirectory()) {

        
        fs.readdir(folder, (err, files) => {
          if (!!err) throw err;

          let next = _.after(files.length, (file) => {
            fs.rmdirSync(folder);
          });

          files.forEach(f => {
            fs.unlinkSync(folder + '/' + f);

            next();
          });
        });
      }
    }

    console.log('unraring', rarFile, '...');
    let cmd = spawn('unrar', ['x', '-inul', dir + rarFile]);
    cmd.on('error', onErr);
    cmd.on('close', (code) => {
      if (code != 0) {
        onErr('unrar failed with ' + code);
      }

      console.log('... unrar\'d', rarFile);

      // Successfully unrar'd

      fs.readdir(folder, (err, files) => {
        onErr(err);

        // files is all of the CSV files :D
        files.slice(0, 40).forEach((f, idx) => {
          console.log(util.format('%s [%d/%d] -> %s', folder, idx, files.length, f));
        });
        if (files.length > 40) {
          console.log(util.format('... %d more files extracted'), files.length - 40);
        }

        const fmapped = files.map(f => ([date, f]));

        const chunks = _.chunk(fmapped, PROCESS_CHUNK_SIZE);
        function run_chunk(idx) {
          if (idx >= chunks.length) {
            return;
          }

          let chunk = chunks[idx];

          let docSet = new Array(chunk.length);

          let perIdx = _.after(chunk.length, () => {
            console.log(util.format("Processing chunk %d/%d", idx+1, chunks.length));

            proc(_.flatten(docSet), () => {
              console.log("running next chunk");
              // recursively start the next chunk
              _.defer(run_chunk, idx+1);
            });

          });

          console.log('chunk =', chunk);
          chunk.forEach((v, cidx) => {
            try {
              return csv_to_docs(Number(v[0]), v[1], (file, docs) => {
                const fidx = idx * PROCESS_CHUNK_SIZE + cidx+1;
                console.log(util.format("Loaded file[%d/%d]: %s (%d docs)", fidx, files.length, file, docs.length));

                docSet[cidx] = docs;

                perIdx();
              });
            } catch (err) {
              onErr(err);
            }
          });
        }

        run_chunk(0);
        
      });
    }); // cmd 'close'
  });
}

// Concert a csv to a doc format
const csv_to_docs = (() => {

  const TICKER_REG = /(\w+)(?:\.csv)/;
  return function (date, file, next) {
    // console.log(util.format("csv_to_docs: %d: %s", date, file));

    const ticker = TICKER_REG.exec(file)[1];
    const ndate = Number(date);

    const path = './' + date + '/' + file;

    fs.readFile(path, (err, data) => {
      if (!!err) throw err;

      parse(data, (err, rows) => {
        if (!!err) throw err;

        let docs = rows.map(row => ({
            date: ndate,
            ticker: ticker,
            time: Number(row[0]),
            data: row.slice(1)
          }));

        next(file, docs);
      });
    });
  };
})();


function process_data() {

  fs.readdir(dir, (err, files) => {
    if (!!err) {
      throw err;
    }

    const rarFiles = _.filter(files, f => f.endsWith('.rar'));

    console.log("rarFiles =>", rarFiles);
    let db = cloudant.db.use(db_name);

    // TODO forEach
    processRar(rarFiles[0], (docs, next) => {
      let chunks = _.chunk(docs, API_CHUNK_SIZE);
      console.log(util.format("Inserting %d docs in %d chunks", docs.length, chunks.length));

      let a_next = _.after(chunks.length, () => {
        console.log("... inserted.");
        next();
      });

      chunks.forEach(chunk => {
        db.bulk({ docs: chunk }, function (err, body) {
          if (!!err) {
            throw err;
          }

          a_next();
        });
      }); // chunk forEach
    });// end process_rar
  });
}

if (clean_db) {
  delete_db(() => {
    create_db(process_data, handleErr);
  }, handleErr);
} else {
  create_db(process_data, handleErr)
}



