'use strict';

const unirest = require('unirest');
const Q = require('q');
const FS = require('q-io/fs');
const util = require('util');
const _ = require('lodash');

const exec = require('child-process-promise').exec;

var directory = process.argv[2];

console.log(util.format("Processing directory: %s", directory));

FS.list(directory)
  .then(function (files) {
    const rarfiles = _.filter(files, function (f) {
      return f.endsWith('.rar');
    });

    console.log("rarFiles =>", rarfiles);

    function processRar(rarFile) {

      const name = /(\d{8})\.rar/.exec(rarFile)[1];
      const folder = './' + name;
      const command = util.format('unrar x %s', directory + rarFile);
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

          // files has all of the csv files for the current one ready to go.

          return FS.removeTree(folder);
        })
        .catch(function (err) {
          console.error('ERROR: ', err);

          return FS.removeTree(folder);
        });
    }

    return processRar(rarfiles[0]);
  })
  .catch(function (e) {
    console.log(e);
  })
  .done(function () {
    console.log("Finished?");
  })
  ;
