
"use strict";

const assert = require('assert');
const path = require('path');

const _ = require('lodash');
const async = require('async');
const request = require('request');

const config = require('blue-config')(path.join(__dirname, '..', 'config'));

module.exports = (get_db) => {

  assert(_.isFunction(get_db), 'db must be specified as object.');

  function check_heartbeats() {
    get_db((err, db) => {
      if (!!err) throw err;

      // get all of the services that are valid
      db.find({ selector: { valid: true } }, (er, result) => {
        if (!!er) {
          throw er;
        }

        // Convert all of the docs into name, url groups
        async.map(result.docs,
          (obj, callback) => {
            request.head(obj.url, (err, body) => {
              // with the results, store the err if it happens
              if (!err) {
                if (body.statusCode !== 200) {
                  err = new Error('Invalid Status Code: ' + body.statusCode);
                  err.statusCode = body.statusCode;
                }
              }

              callback(null, _.extend(obj, { error: err }));
            });
          },
          (err, checked) => {

            // checked has the objects including non-errored versions
            async.map(_.filter(checked, o => (!!o.error)),
              (obj, callback) => {

                let destroy = false;

                if (_.has(obj.error, 'code')) {
                  switch (obj.error.code) {
                    case 'ECONNREFUSED':
                    case 'ECONNRESET':
                      // bad!
                      destroy = true;
                      break;

                    default:
                      console.log('Error: %s = %s', obj.name, obj.error.code);
                      break;
                  }
                } else if (_.has(obj.error, 'statusCode')) {
                  switch (obj.error.statusCode) {
                    case 500: // Internal Server Error
                    case 503: // Service Unavailable
                      destroy = true;
                      break;

                    default:
                      // don't destroy!
                      break;

                  }
                }

                // destroy the obj if required
                if (destroy) {
                  db.destroy(obj._id, obj._rev, callback);
                } else {
                  callback();
                }
              },
              () => {
                // Reset the timer!
                setTimeout(check_heartbeats, config.locals.heartbeat.timeout);
              });


        });
      });
    });
  }

  check_heartbeats();

};
