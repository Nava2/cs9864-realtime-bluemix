'use strict';

const assert = require('assert');
const url = require('url');
const util = require('util');

const moment = require('moment');
const request = require('request');
const _ = require('lodash');

const formatter = require('formatter');

const Cloudant = require('cloudant');

module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));
  if (!!process.env['LOG_LEVEL']) {
    w.level = process.env['LOG_LEVEL'];
  }

  const EndPoint = require('./endpoint')(w);

  const F = {
    EXACT_EP: formatter('verb:{{ verb }} AND hostname:"{{ hostname }}" ' +
                          'AND pathname:"{{ pathname }}" AND port:"{{ port }}"')
  };

  class Manager {
    
    /**
     * Create a new `Manager` that manages endpoints against a cloudant-based storage.
     *
     * @param {String|URL} config.url Cloudant database URL
     *
     * @param {Number} [config.refresh-rate=120000] Milliseconds between updating cloudant storage
     * @param {String} [config.database] Name of the database on Cloudant
     */
    constructor(config) {

      config = _.defaults(config, {
        "refresh-rate": 120000 // 2 minutes
      });

      if (!_.isString(config.url)) {
        if (!!config.url.protocol) {
          config.url = url.format(config.url);
        } else {
          throw new TypeError('config.url must be a string or URL object');
        }
      }

      // Initialize the library with my account.

      this._refreshRate = config['refresh-rate'];
      this._url = config.url;
      this._dbName = config.database;
    }

    static _safeNext(next) {
      if (_.isFunction(next) && next.name === '__Manager__safeNext') {
        return next;
      }

      function __Manager__safeNext(err) {
        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      }

      return __Manager__safeNext;
    }

    _fetchEndpoints(next) {
      const snext = Manager._safeNext(next);

      // fetch the endpoints from the server
      this._db.find({
        selector: {
          _id: { '$gt': 0 }
        }
      }, (err, result) => {

        if (!err) {
          let docs = result.docs;

          // build up two maps: 1) ticker => id, 2) id => endpoint
          let tmap = {}, imap = {};
          _.filter(docs, d => (_.has(d, 'endpoint'))).forEach(doc => {
            doc.tickers.forEach(ticker => {
              if (!_.has(tmap, ticker)) {
                tmap[ticker] = new Set();
              }

              tmap[ticker].add(doc._id);
            });

            imap[doc._id] = {
              tickers: doc.tickers,
              ep: new EndPoint(doc.endpoint)
            };
          });

          this._tickerMap = tmap;
          this._epMap = imap;
        }

        snext(err);
      });
    }

    _verifyIndex(next) {
      assert(!!this._db);

      // use var because we don't know es6 compat
      const ep_indexer = function (doc) {
        if (!!doc.endpoint) {
          var ep = doc.endpoint;

          index('verb', ep.verb);
          index('hostname', ep.hostname);
          index('port', ep.port);
          index('pathname', ep.pathname);
        }
      };

      const indexDoc = {
        _id: '_design/endpoints',
        indexes: {
          endpoints: {
            analyzer: {name: 'standard'},
            index   : ep_indexer,
            fields: [ '_rev' ]
          }
        }
      };

      const db = this._db;

      db.find({
        selector: {
          '_id': indexDoc._id
        }
      }, (err, res) => {
        // w.debug('res = %s', util.inspect(res.indexes));

        if (res.docs.length < 1) {
          // not found :<

          db.insert(indexDoc, (err, res) => {
            w.debug('Index created? %s', !err ? res.ok : false);
            next(err);
          });

        } else {

          next(err);
        }
      });

    }

    _initDb(cloudant, next) {
      assert(!this._db);

      const snext = Manager._safeNext(next);
      cloudant.db.create(this._dbName, err => {
        if (!err) {
          this._db = cloudant.db.use(this._dbName);
        }

        snext(err);
      });
    }

    init(next) {
      if (!!this._db) {
        w.warn("Attempted to initialize EndpointManager multiple times.");

        return;
      }

      const cloudant = Cloudant({url: this._url});

      const snext = Manager._safeNext(next);
      const dbExists = () => {

        // when the db exists, run a verify
        this._verifyIndex(err => {
          if (!err) {
            // do an initial fetch
            this._fetchEndpoints(err => {
              this._fetchInterval = setInterval(_.bind(this._fetchEndpoints, this), this._refreshRate);

              snext(err);
            });

          } else {
            snext(err);
          }
        });


      };

      cloudant.db.get(this._dbName, err => {
        if (!!err) {
          if (err.error === 'not_found') {
            w.debug("Creating new database, was not found: %s", this._dbName);

            this._initDb(cloudant, dbExists);
          } else {
            w.error("Unknown error occurred: %s", err.error);

            snext(err);
          }
        } else {
          w.debug('Database, %s, found.', this._dbName);

          this._db = cloudant.db.use(this._dbName);
          dbExists();
        }
      });

    }

    stop(next) {
      const snext = Manager._safeNext(next);

      if (!this._fetchInterval) {
        snext(new Error('Can not stop unstarted Manager.'));
      } else {
        clearInterval(this._fetchInterval);

        snext();
      }
    }

    /**
     * Get all of the EndPoint instances that subscribe to the `tickers`.
     * @param {String[]} tickers Tickers requested.
     * @returns {EndPoint[]} Array of endpoint instances
     */
    endPointsFor(tickers) {
      let epIds = new Set();
      const tmap = this._tickerMap;
      tickers.forEach(ticker => {
        if (_.has(tmap, ticker)) {
          tmap[ticker].forEach(id => {
            epIds.add(id);
          });
        } else {
          // w.debug('Ticker %s is not currently subscribed to.', ticker);
        }
      });

      // now we have all the epIds we need:
      let eps = [];
      epIds.forEach(id => {
        eps.push(this._epMap[id]);
      });
      return eps;
    }

    /**
     * Add's an endpoint to the manager and if necessary, adds/updates the database
     * @param {{endpoint: EndPoint, tickers: String[]}} ep
     * @param [next]
     */
    addEndPoint(ep, next) {
      assert(!!ep);

      const snext = Manager._safeNext(next);

      if (!this._db) {
        snext(new Error("Can not add an endpoint, must call Manager#init() first."));
        return;
      }

      const tickers = ep.tickers.map(_.lowerCase);
      const Q = F.EXACT_EP(ep.endpoint.json);

      const db = this._db;
      db.search('endpoints', 'endpoints', { q: Q }, (err, res) => {
        if (!err) {
          if (res.rows.length > 0) {
            // it already exists
            // don't add it, but do check if updates are needed
            db.get(res.rows[0].id, (err, res) => {
              if (!err) {
                if (_.has(res, 'tickers')
                    && _.has(res, 'endpoint')
                    && !_.isEqual(res.tickers, tickers)) {
                  // need to update:
                  db.insert(_.extend(res, {
                    tickers: tickers
                  }), snext);

                } else {
                  // no need to update, just pass it on
                  snext(err);
                }
              } else {
                // error happened when trying to get the row
                snext(err);
              }
            });
          } else {
            // else it doesn't exist, so add it!

            db.insert({
              tickers: ep.tickers,
              endpoint: ep.endpoint.json
            }, snext);
          }
        } else {
          // !err - db.search()
          snext(err);
        }
      });
    }

    /**
     * Removes's an endpoint from the manager and if necessary, removes it from the database
     * @param {EndPoint} ep
     * @param [next]
     */
    removeEndpoint(ep, next) {
      assert(!!ep);

      const snext = Manager._safeNext(next);

      if (!this._db) {
        snext(new Error("Can not remove an endpoint, must call Manager#init() first."));
        return;
      }

      const Q = F.EXACT_EP(ep.json);

      const db = this._db;
      db.search('endpoints', 'endpoints', { q: Q }, (err, res) => {
        if (!err) {
          if (res.rows.length > 0) {
            // it exists, so get the revision
            let id = res.rows[0].id;
            db.get(id, (err, res) => {
              assert(id === res._id);

              // now actually destroy it
              if (!err) {
                db.destroy(id, res._rev, snext);
              } else {
                snext(err);
              }
            });
          } else {
            // else it doesn't exist, so we can ignore it..

            snext(err);
          }
        } else {
          // !err - db.search()
          snext(err);
        }
      });
    }

  }

  return {
    Manager: Manager,
    EndPoint: EndPoint
  };
};


