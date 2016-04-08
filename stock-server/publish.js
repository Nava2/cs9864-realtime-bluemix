'use strict';

const zlib = require('zlib');

const _ = require('lodash');
const sqlite3 = require('sqlite3');
const moment = require('moment');

const history = require('./history');

module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));

  const CastServer = require('./cast-server')(w);

  /**
   * @enum
   */
  const SERVICE_STATE = {
    NEW: -1,
    STARTED: 0,
    RUNNING: 1,
    STOPPING: 10,
    STOPPED: 11
  };

  /**
   * Converts a state to a {String}.
   * @param state {SERVICE_STATE}
   * @returns {String} String representation of a state
   */
  function stateToStr(state) {
    switch (state) {
      case SERVICE_STATE.NEW:
        return "NEW";

      case SERVICE_STATE.RUNNING:
        return "RUNNING";

      case SERVICE_STATE.STARTED:
        return "STARTED";

      case SERVICE_STATE.STOPPING:
        return "STOPPING";

      case SERVICE_STATE.STOPPED:
        return "STOPPED";

      default:
        throw new TypeError(`Unknown state: ${state}`);
    }
  }

  class Service {

    constructor(config) {
      config = _.defaults(config, {
        'chunk-size': 1000
      });

      this._db = new sqlite3.Database(config.database);
      this._cast = new CastServer(config);

      this._chunkSize = config['chunk-size'];

      this._history = new history.History();

      this._state = SERVICE_STATE.NEW;
      this._stopCallback = null;

      this._publishInterval = null;
    }

    get history() {
      return this._history;
    }

    get state() {
      return stateToStr(this._state);
    }

    /**
     * 
     * @param {EndPoint} endpoint
     * @param next
     */
    registerEndPoint(endpoint, next) {
      this._cast.registerEndPoint(endpoint, next);
    }

    /**
     * Unregisters an endPoint from receiving messages.
     * @param@param {EndPoint} endpoint
     * @callback next Called when the end point is removed
     */
    unregisterEndPoint(endpoint, next) {
      this._cast.unregisterEndPoint(endpoint, next);
    }

    /**
     *
     * @callback next Called after the database query finishes sending
     * @private
     */
    _publish(next) {

      // Handle state changes for the service, the state can change asynchronously
      switch (this._state) {
        case SERVICE_STATE.RUNNING:
          // do nothing
          break;

        case SERVICE_STATE.STARTED:
          this._state = SERVICE_STATE.RUNNING;
          break;

        case SERVICE_STATE.STOPPING:
          this._state = this._state.STOPPED;
          if (_.isFunction(this._stopCallback)) {
            this._stopCallback();
          }
          return;

        case SERVICE_STATE.STOPPED:
          w.warn('Publish called after stopping? Probably means we can\'t keep up :(');
          return;

      }

      const nowish = this._history.nowish;

      if (this._cast.endPoints.length <= 0) {
        // skip out early if there are no end points.
        w.silly('%s: No endpoints registered, not sending.', nowish.format('YYYY-MM-DDThh:mm:ss'));
        return;
      }

      const db = this._db;
      const cs = this._cast;

      // Build up some constants used in SQL queries
      const time = nowish.format('hh:mm:ss');
      const date = nowish.format('YYYYMMDD');

      const params = { $stamp: time };

      const SQL_TIME_COND = ' (time = $stamp) ';

      const sql_ttable = `trans_${date}`;

      const sql_ticker_counts = 'SELECT ticker' +
        ', ticker_id' +
        ', COUNT(*) AS cnt ' +
        `FROM ${sql_ttable}, tickers ` +
        `WHERE ${SQL_TIME_COND} ` +
          'AND tickers.id = ticker_id ' +
        'GROUP BY ticker_id ' +
        'ORDER BY ticker_id ASC';

      const CHUNK_SIZE = this._chunkSize;

      // called after all data is sent
      let rnext = err => {
        if (!!err) {
          if (_.isFunction(next)) {
            next(err);
          } else {
            throw err;
          }
        }

        w.debug('%s: Processed and sent data', time);

        if (_.isFunction(next)) {
          next();
        }
      };

      // Query all of the tickers and how many they have for the current time range
      // This lets a receiving service get a nicer idea of what is loaded into the packets
      db.all(sql_ticker_counts, params, (err, tickerRows) => {
        if (!!err) {
          w.warn('Failure in sql execution: %s', sql_ticker_counts);
          rnext(err);
          return;
        }

        function runRows(idx) {

          if (idx >= tickerRows.length) {
            // recursive break condition
            rnext();
            return;
          }

          // iterate over the rows until we get either a chunk larger than `this._chunkSize` OR run out
          // we also package up the ticker IDs so that we can query in smaller chunks

          const min_ticker = tickerRows[idx]['ticker_id'];
          let rowCount = 0;
          let max_ticker = 0;
          let tickers = [];
          const fidx = idx;
          while (idx < tickerRows.length && rowCount <= CHUNK_SIZE) {
            const r = tickerRows[idx];

            rowCount += r['cnt'];
            max_ticker = r['ticker_id'];
            tickers.push(r['ticker']);

            idx++;
          }

          // if we break out, we have enough ticker_ids
          w.debug('%s: Packaging %d/%d tickers: (%d, %d) together',
            time,
            idx - fidx, tickerRows.length,
            min_ticker, max_ticker);

          // Get all of the ticker data, we ignore the `time` field because it's already known from the package
          const sql_get_data = `SELECT ${sql_ttable}.id` +
            ', ticker' +
            ', price' +
            ', size' +
            ', exchange_id' +
            ', condition_code AS cc' +
            ', suspicious AS sus ' +
            `FROM ${sql_ttable}, tickers ` +
            `WHERE (tickers.id = ${sql_ttable}.ticker_id) ` +
              `AND ${SQL_TIME_COND} ` +
              'AND (ticker_id BETWEEN $min_ticker AND $max_ticker) ' +
            `ORDER BY ${sql_ttable}.id`;
          const tickParams = {
            $min_ticker: min_ticker,
            $max_ticker: max_ticker
          };

          db.all(sql_get_data, _.extend(params, tickParams), (err, dataRows) => {
            if (!!err) {
              w.warn('Failure in sql execution: %s', sql_get_data);
              rnext(err);
              return;
            }

            // Build the json payload and send it to the subscribed services
            const jsonData = {
              when: nowish.format('YYYY-MM-DDThh:mm:ss'),
              tickers: tickers
            };

            const payload = _.chain(dataRows)
              .groupBy(r => (r.ticker))
              .mapValues(v => (v.map(v2 => (_.omit(v2, ['ticker'])))))
              .value();

            let buff = new Buffer(JSON.stringify(payload), 'ascii');
            zlib.gzip(buff, (err, cbuff) => {
              if (!!err) {
                rnext(err);
              } else {
                jsonData.payload = cbuff.toString('base64');
                cs.send(jsonData, err => {
                  if (!!err) {
                    rnext(err);
                  } else {
                    // now we recursively call the runRows function
                    runRows(idx);
                  }
                });
              }

            });


          });
        }

        runRows(0);
      });

    }


    /**
     * Format the JSON for a signal
     * @param {String} signal Message to pass
     * @return {{signal: String, nowish: String}}
     * @private
     */
    _sigMsg(signal) {
      return {
        signal: signal,
        nowish: this._history.nowish.format('YYYY-MM-DDThh:mm:ss')
      };
    }

    /**
     * Starts a service, calls `next` after it starts.
     * @callback next
     */
    start(next) {
      if (this._state != SERVICE_STATE.NEW && this._state != SERVICE_STATE.STOPPED) {
        const msg = `Trying to start already started service (${this._state})`;
        const err = new Error(msg);

        if (_.isFunction(next)) {
          next(err);
        } else {
          w.error(msg);
          throw err;
        }
      } else {
        this._cast.start(() => {
          this._cast.signal(this._sigMsg('START'), err => {
            this._state = SERVICE_STATE.STARTED;
            w.info('Started publishing service');

            this._publishInterval = setInterval(_.bind(this._publish, this), 1000);

            if (_.isFunction(next)) {
              next(err);
            }
          });
        });
      }


    }

    /**
     * Stop the service
     * @callback next called after the service stops.
     */
    stop(next) {
      this._stopCallback = () => {
        this._stopCallback = null;

        clearInterval(this._publishInterval);
        this._publishInterval = null;

        this._cast.signal(this._sigMsg('STOPPED'), err => {
          this._state = SERVICE_STATE.STOPPED;

          if (_.isFunction(next)) {
            next(err);
          }
        });
      };

      this._state = SERVICE_STATE.STOPPING;
    }

    /**
     * Reset the Service, stopping the current sending
     * @param {moment} [START] Time to start the service
     * @param {function} [next] Called after the reset completes
     */
    reset(START, next) {
      if (!_.isUndefined(START)) {
        if (!_.isFunction(START)) {
          if (!moment.isMoment(START)) {
            throw new TypeError("START must be a `moment`.");
          }

          // START is a moment
        } else {
          // START is callback
          next = START;
          START = undefined;
        }
      }

      const cb = err => {
        if (!!err) throw err;

        this._history = new history.History(START);

        this.start(next);
      };

      if (this._state != SERVICE_STATE.NEW) {
        this.stop(cb);
      } else {
        w.info('Resetting a NEW service..');
        cb();
      }
    }
  }

  return Service;
};

