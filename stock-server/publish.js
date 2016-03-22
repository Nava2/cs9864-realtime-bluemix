'use strict';

module.exports = (winston) => {

  const w = winston;
  const _ = require('lodash');
  const sqlite3 = require('sqlite3');
  const moment = require('moment');

  const history = require('./history');
  const cast_serv = require('./cast-serv')(winston);

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
        'chunk-size': 1500
      });

      this._db = new sqlite3.Database(config.database);
      this._cast_serv = new cast_serv.Server(config);

      this._chunkSize = config['chunk-size'];

      this._history = new history.History();

      this._state = SERVICE_STATE.NEW;
      this._stopCallback = null;

      this._publishInterval = null;
      this._exchange_id = config.exchange_id;
    }

    get history() {
      return this._history;
    }

    get state() {
      return stateToStr(this._state);
    }

    get exchange() {
      return this._exchange_id;
    }

    registerEndPoint(address, port, next) {
      this._cast_serv.registerEndPoint(address, port, next);
    }

    /**
     * Unregisters an endPoint from receiving messages.
     * @param address IP address to remove
     * @param [port] {Number}
     * @callback next Called when the end point is removed
     */
    unregisterEndPoint(address, port, next) {
      this._cast_serv.unregisterEndPoint(address, port, next);
    }

    /**
     *
     * @callback next Called after the database query finishes sending
     * @private
     */
    _publish(next) {
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

      const NOWISH = this._history.nowish;
      const TIME = NOWISH.format('hh:mm:ss');
      const TIME_P1 = NOWISH.clone().add(1, 's').format('hh:mm:ss');
      const DATE = NOWISH.format('YYYYMMDD');
      const SQL_STATEMENT = `SELECT trans_${DATE}.id` +
        ', ticker' +
        ', time' +
        ', price' +
        ', size' +
        ', exchange_id' +
        ', condition_code AS cc' +
        ', suspicious AS sus ' +
        `FROM trans_${DATE}, tickers ` +
        `WHERE ((tickers.id = trans_${DATE}.ticker_id) ` +
        'AND (time >= $stamp AND time < $stampP1)) ' +
        `ORDER BY trans_${DATE}.id`;
      const params = { $stamp: TIME, $stampP1: TIME_P1 };

      this._db.all(SQL_STATEMENT, params, (err, rows) => {
        if (!!err) {
          throw err;
        }

        let rowsL = rows.length;
        let strs = rows.map(r => (`${cast_serv.idx(r.id)}::${r.ticker},${TIME},${r.price},${r.size},${r.exchange_id},${r.cc},${r.sus}`));

        let chunks = _.chunk(strs, this._chunkSize);

        let rnext = _.after(chunks.length, err => {
          if (!!err) {
            throw err;
          }

          w.debug(`Published (${rowsL}) transactions: ${TIME}`);

          if (_.isFunction(next)) {
            next();
          }
        });

        chunks.forEach(chk => {
          let rbuffer = new Buffer(_.reduce(chk, (s, str) => (s + '\n' + str)), 'ascii');

          this._cast_serv.send(rbuffer, rnext);
        });
      });
    }

    /**
     * Starts a service, calls `next` after it starts.
     * @callback next
     */
    start(next) {
      if (this._state != SERVICE_STATE.NEW) {
        w.error(`Starting already started service (${this._state})`);

        return;
      }

      this._cast_serv.start(() => {
        this._cast_serv.signal('START', () => {
          this._state = SERVICE_STATE.STARTED;
          w.info('Started publishing service');

          this._publishInterval = setInterval(_.bind(this._publish, this), 1000);

          if (_.isFunction(next)) {
            next();
          }
        });
      });

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

        this._cast_serv.signal('STOPPED', next);
      };

      this._state = SERVICE_STATE.STOPPING;
    }

    /**
     * Reset the Service, stopping the current sending
     * @param [START] {moment} Time to start the service
     * @callback [next] Called after the reset completes
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

      const cb = () => {
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

  return {
    Service: Service,

    STATE: SERVICE_STATE
  };
};

