'use strict';

const assert = require('assert');
const url = require('url');
const util = require('util');

const moment = require('moment');
const request = require('request');
const _ = require('lodash');

const formatter = require('formatter');

const Cloudant = require('cloudant');

const safe = require('./safe-callback');

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
     * @param {String|URL} config.cloudantUrl Cloudant database URL
     *
     * @param {Number} [config.refresh-rate=120000] Milliseconds between updating cloudant storage
     * @param {String} [config.database] Name of the database on Cloudant
     */
    constructor(config) {

      config = _.defaults(config, {
        "refresh-rate": 30000 // 2 minutes
      });

      // Initialize the library with my account.

      this._refreshRate = config['refresh-rate'];
      this._url = config.cloudantUrl;
      this._dbName = config.database;

      if (this._url.slice(-1) == '/') {
        this._url = this._url.slice(0, -1);
      }
    }

    _fetchEndpoints(next) {
      const snext = safe(next);

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
        if (!err && res.docs.length < 1) {
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

      const snext = safe(next);
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

      const snext = safe(next);
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
      const snext = safe(next);

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
     * @returns {{ep: EndPoint, tickers: String[]}[]} Array of endpoint instances
     */
    endPointsFor(tickers) {
      let eps = [];
      const tmap = this._tickerMap;
      tickers.map(_.lowerCase).forEach(ticker => {
        if (_.has(tmap, ticker)) {
          tmap[ticker].forEach(id => {
            eps.push(id);
          });
        } else {
          // w.debug('Ticker %s is not currently subscribed to.', ticker);
        }
      });

      eps = _.uniq(eps);

      if (eps.length > 0) {
        w.debug("EPManager::endPointsFor: Found tickers relevant to: ", eps);
      }

      // now we have all the epIds we need:
      return eps.map(id => (this._epMap[id]));
    }

    /**
     * Add's an endpoint to the manager and if necessary, adds/updates the database
     * @param {{endpoint: EndPoint, tickers: String[]}} ep
     * @param [next]
     */
    addEndPoint(ep, next) {
      assert(!!ep);

      const snext = safe(next);

      if (!this._db) {
        snext(new Error("Can not add an endpoint, must call Manager#init() first."));
        return;
      }

      const tickers = ep.tickers.map(_.lowerCase);
      const Q = F.EXACT_EP(ep.endpoint.toJson());
      w.info('EndPointManager: Register Query: %s', Q);

      const db = this._db;

      function update(res) {
        w.debug('EndPointManager#addEndPoint: Update', ep.endpoint.toString());
        w.debug('get.res =', util.inspect(res));
        db.insert(_.extend(res, {
          tickers: _.uniq(_.flatten(tickers, res.tickers)).sort()
        }), snext);
      }

      function create() {
        w.debug('EndPointManager#addEndPoint: Create', ep.endpoint.toString());
        db.insert({
          tickers: ep.tickers,
          endpoint: ep.endpoint.toJson()
        }, snext);
      }

      db.search('endpoints', 'endpoints', { q: Q }, (err, res) => {
        if (!err) {
          if (res.rows.length > 0) {
            w.debug('search.res =', util.inspect(res));
            // it already exists
            // don't add it, but do check if updates are needed
            db.get(res.rows[0].id, (err, res) => {
              if (!err) {
                w.debug("get.res =", util.inspect(res, {deep: true}));

                if (_.isEqual(res.endpoint, ep.endpoint.toJson())) {
                  if (!_.isEqual(res.tickers, tickers)) {
                    // need to update because the tickers are different

                    w.silly("EndPointManager#addEndPoint: Updating, tickers do not match.");
                    update(res);
                  } else {
                    // no need to update, the tickers are identical
                    w.silly("EndPointManager#addEndPoint: Not updating, the tickers are identical");
                    snext(err);
                  }
                } else {
                  // need to create new endpoint
                  w.silly("EndPointManager#addEndPoint: Create: found endpoint is not correct.");
                  create();
                }
              } else {
                // error happened from db.get()
                w.silly("EndPointManager#addEndPoint: Error occured:", err.toString());
                snext(err);
              }
            });
          } else {
            // else it doesn't exist, so add it!
            w.silly("EndPointManager#addEndPoint: Creating new instance because no row was found by query:", Q);
            create();
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

      const snext = safe(next);

      if (!this._db) {
        snext(new Error("Can not remove an endpoint, must call Manager#init() first."));
        return;
      }

      const Q = F.EXACT_EP(ep.toJson());
      w.silly('EndPointManager#removeEndpoint: Query: %s', Q);

      const db = this._db;
      db.search('endpoints', 'endpoints', { q: Q }, (err, res) => {
        if (!err) {
          w.debug('EPManager#removeEndpoint: search.res =', util.inspect(res));
          if (res.rows.length > 0) {
            // it already exists
            // don't add it, but do check if updates are needed
            db.get(res.rows[0].id, (err, res) => {
              if (!err) {
                w.debug("EPManager#removeEndpoint: get.res =", util.inspect(res, {deep: true}));

                if (_.isEqual(res.endpoint, ep.toJson())) {
                  // now actually destroy it
                  w.debug("EPManager#removeEndpoint: Removing (%s, %s)", res._id, res._rev);

                  db.destroy(res._id, res._rev, snext);
                }
              } else {

              }
            });
          } else {
            // else no rows exist
            w.silly("EPManager#removeEndpoint: Could not find result from search (likely already deleted).");

            snext(err);
          }
        } else {
          // !err - db.search()
          w.silly("EPManager#removeEndpoint: Error in search.");
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


