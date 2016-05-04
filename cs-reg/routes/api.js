'use strict';

const assert = require('assert');
const path = require('path');
const url = require('url');
const util = require('util');

const express = require('express');

const async = require('async');
const validUrl = require('valid-url');
const _ = require('lodash');

const config = require('blue-config')(path.join(__dirname, '..', 'config'));

const Cloudant = require('cloudant');
const cloudant = Cloudant(config.getServiceURL('Cloudant Storage').slice(0, -1));

const DB = {
  COLLECTION: "cs-registry",
  NAME: "name",
  URL: "url"
};

module.exports = (DB_NAME) => {
  assert(_.isString(DB_NAME), 'Database name must be a string.');

  let router = express.Router();

  //prepare the index for query
  let indexfields = (() => {

    let db = null;

    return (callback) => {
      if (!!db) {

        callback(null, db);
      } else {
        // need to check indexes (!checked)
        db = cloudant.db.use(DB_NAME);

        db.index((er, result) => {

          let index_calls = [];

          let index_arr = [];
          if (!er) {
            console.log('The database has %d indexes', result.indexes.length);

            index_arr = _.flatten(result.indexes.map(v => {
              return _.keys(v.def['fields'][0]);
            }));
          }

          //create index for the service name field if it does not exist.
          if (index_arr.indexOf(DB.NAME) == -1) {
            var name_index = {
              name: 'name_index',
              type: 'json',
              index: {
                fields: [DB.NAME]
              }
            };

            index_calls.push(callback => {
              db.index(name_index, callback);
            });
          }

          //create index for the service name field if it does not exist.
          if (index_arr.indexOf(DB.URL) == -1) {
            let date_index = {
              name: 'url_index',
              type: 'json',
              index: {
                fields: [DB.URL]
              }
            };

            index_calls.push(callback => {
              db.index(date_index, callback);
            });
          }

          if (index_arr.indexOf("valid") == -1) {
            let valid_index = {
              name: 'valid_index',
              type: 'json',
              index: {
                fields: ["valid"]
              }
            };

            index_calls.push(callback => {
              db.index(valid_index, callback);
            });
          }

          async.parallel(index_calls, err => {
            callback(err, db);
          });
        });
      } // else checked
    };


  })();


  let get_database = (() => {
    let db = null;

    return function get_database(callback) {
      if (!!db) {
        callback(null, db);
      } else {

        let on_good = function on_good() {
          db = cloudant.use(DB_NAME);
          indexfields(callback);
        };

        cloudant.db.get(DB_NAME, (err, body) => {
          if (!!err) {
            cloudant.db.create(DB_NAME, (err, body) => {
              if (!!err || !body.ok) {
                callback(err || false);
              } else {
                on_good();
              }
            });
          } else {

            on_good();
          }
        });
      }
    };
  })();

  // eg. http://localhost:6004/add?name=s1&url=http://www.ss.com
  // accept many different names refering to the same url.
  // register a new service
  router.post('/add', (req, res) => {
    let regname, regurl;

    if (_.isString(req.query.name)) {
      regname = req.query.name;
    } else {
      res.status(400).json({ error: 'Invalid name.' });
      return;
    }

    if (validUrl.isUri(req.query.url)) {
      regurl = req.query.url;
    } else {
      res.status(400).json({ error: 'Invalid url.' });
      return;
    }

    get_database((err, db) => {
      if (!!err) throw err;

      // check duplicated name
      let query = {};
      query[DB.NAME] = regname;
      db.find({ selector : query }, (er, result) => {
        if (!!er) {
          throw er;
        }

        if (result.docs.length > 0) {

          res.json({ warn: 'The service already exists.' });
        } else {

          let query = {
            valid: true
          };
          query[DB.NAME] = regname;
          query[DB.URL] = regurl;

          db.insert(query, err => {
            if (!!err) {
              res.status(403).json({ success: false, error: err.error });
            } else {
              res.json({ name : regname, url : regurl });
            }
          });
        }
      });
    });

  });

  // eg. http://localhost:6004/list
  // list all the services
  router.get('/list', (req, res) => {

    get_database((err, db) => {
      if (!!err) throw err;

      // get all of the services that are valid
      db.find({ selector: { valid: true } }, (er, result) => {
        if (!!er) {
          throw er;
        }

        let arr = result.docs.map(v => {
          return _.pick(v, [DB.NAME, DB.URL]);
        });

        res.json(arr);
      });
    });
  });

  //eg. http://localhost:6004/getname?url=http://www.ss3.com
  // return the name given the url
  router.get('/name', (req, res) => {

    let regurl;
    if (!validUrl.isUri(req.query.url)) {
      regurl = req.query.url;
    } else {
      res.status(403).json({ error: 'URL is invalid.' });
      return;
    }

    get_database((err, db) => {
      if (!!err) throw err;

      // check duplicated url
      let query = {};
      query[DB.URL]=regurl;

      db.find({ selector: query }, (er, result) => {
        if (!!er) {
          throw er;
        }

        res.json(result.docs.map(v => (v[DB.NAME])));
      });
    });
  });

  // eg. http://localhost:6004/geturl?name=s1
  // return the url given the name
  router.get('/url', function (req, res) {
    let regname;
    if (!_.isString(req.query.name)) {
      regname = req.query.name;
    } else {
      res.status(403).json({ error: 'Name is invalid.' });
      return;
    }

    get_database((err, db) => {
      if (!!err) throw err;

      // check duplicated name
      let query = {};
      query[DB.NAME] = regname;
      db.find({ selector: query }, (er, result) => {
        if(!!er) {
          throw er;
        }

        res.json(_.map(result.docs, v => (v[DB.URL])));
      });
    });
  });

  //delete the service by name
  router.delete('/name', (req, res) => {
    let regname;
    if (!_.isString(req.query.name)) {
      regname = req.query.name;
    } else {
      res.status(403).json({ error: 'Name is invalid.' });
      return;
    }

    get_database((err, db) => {
      if (!!err) throw err;

      // check duplicated name
      let query=  {};
      query[DB.NAME] = regname;
      db.find({ selector: query }, (er, result) => {
        if(!!er) {
          res.json({ error: 'can not access the db' });
        } else {
          async.map(result.docs, (doc, callback) => {
            db.destroy(doc._id, doc._rev, err => {
              callback(err);
            });
          }, err => {
            // check if theres an error
            res.json({ success: !err });
          });
        }
      });
    });
  });

  // delete the service by url
  router.delete('/url', (req, res) => {
    let regurl;
    if (!validUrl.isUri(req.query.url)) {
      regurl = req.query.url;
    } else {
      res.status(403).json({ error: 'URL is invalid.' });
      return;
    }

    get_database((err, db) => {
      if (!!err) throw err;

      let query = {};
      query[DB.URL] = regurl;

      db.find({ selector: query }, (er, result) => {
        if (!!er) {
          res.json({ error: 'can not access the db' });
        } else {
          async.map(result.docs, (doc, callback) => {
            db.destroy(doc._id, doc._rev, err => {
              callback(err);
            });
          }, err => {
            // check if theres an error
            res.json({ success: !err });
          });
        }
      });
    });
  });

  return {
    router: router,

    get_database: get_database
  };

};
