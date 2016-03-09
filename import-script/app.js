'use strict';



const unirest = require('unirest');
const Q       = require('q');
const FS      = require('q-io/fs');
const util    = require('util');
const _       = require('lodash');
const assert  = require('assert');


const Cloudant = require('cloudant');
const cloudant_cred = require('./cloudant.json').credentials;
const cloudant = Cloudant(cloudant_cred.url);

const exec = require('child-process-promise').exec;

const argv = require('minimist')(process.argv.slice(2), {
  default: {
    db: 'stock-data-test',
    'clean-db': false
  }
});


console.log(argv);
assert(argv.dir, "`dir` parameter must be specified on the command line.");
assert(argv.db, "`db` parameter must be specified on the command line.")

const dir       = argv.dir;
const db_name   = argv.db;
const clean_db  = argv['clean-db'];

console.log(util.format("Reading from %s, storing into %s.%s", dir, cloudant_cred.host, db_name));

function handleErr(err) {
  if (!!err) {
    throw err;
  }
}

// Simple callback for creating a db
function create_db(next, errcb) {
  // Create a new 'db' database.
  cloudant.db.create(db_name, function() {

    // Specify the database we are going to use (alice)...
    var db = cloudant.db.use(db_name)

    next(db);
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

if (clean_db) {
  delete_db(() => {
    create_db(process_data, handleErr);
  }, handleErr);
} else {
  create_db(process_data, handleErr)
}

// Process a RAR file, unrar it then return an aggregated promise against all files
// Additionally, it removes the unrar'd files after
function processRar(rarFile, proc) {

  const name = /(\d{8})\.rar/.exec(rarFile)[1];
  const folder = './' + name;
  const command = util.format('unrar x %s', dir + rarFile);
  console.log("command =>", command);

  return FS.exists(folder)
    .then(function (exists) {
      if (exists) {
        return FS.removeTree(folder);
      } else {
        return Q({});
      }
    })
    .then(function () {
      return exec(command, {maxBuffer: 1024 * 1024});
    })
    .then(function () {
      return FS.list(folder);
    })
    .then(function (files) {
      files.slice(0, 40).forEach(function (f, idx) {
        console.log(util.format('%s[%d/%d] -> %s', folder, idx, files.length, f));
      });
      if (files.length > 40) {
        console.log(util.format('... %d more files extracted'), files.length - 40);
      }

      return Q(files.map(proc));
      // files has all of the csv files for the current one ready to go.
    }) 
    .finally(() => {
      return FS.removeTree(dir);
    })
    .catch(function (err) {
      console.error('ERROR: ', err);

      return FS.removeTree(folder);
    });
}


function process_data(db) {
  FS.list(dir)
    .then(function (files) {
      const rarfiles = _.filter(files, function (f) {
        return f.endsWith('.rar');
      });

      console.log("rarFiles =>", rarfiles);

      return processRar(rarfiles[0], file => {
        
      });
    })
    .catch(function (e) {
      console.log(e);
    })
    .done(function () {
      console.log("Finished?");
    });
}



