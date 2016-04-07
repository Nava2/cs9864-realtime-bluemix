'use strict';

const assert = require('assert');
const url = require('url');
const util = require('util');
const os = require('os');
const zlib = require('zlib');

const moment = require('moment');
const request = require('request');
const _ = require('lodash');

const express = require('express');
const bodyParser = require('body-parser');


module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));
  if (!!process.env.LOG_LEVEL) {
    w.level = process.env.LOG_LEVEL;
  }

  /**
   * Specialized class that handles memoizing a compressed payload
   */
  class Data {

    /**
     * Accepts the JSON format passed by the stock server.
     * @param {{when: String, tickers: String[], payload: String}} json JSON data from Stock Server
     */
    constructor(json) {

      this._when = moment(json.when);
      this._tickers = new Set(json.tickers);

      this._payload = {
        buff: new Buffer(json.payload, 'base64'),
        decoded: undefined
      };
    }

    get when() { return this._when; }
    get tickers() { return this._tickers; }

    /**
     * Get the payload of the data, it will decoded it if necessary. This method memoizes the value so it is only
     * decoded once.
     *
     * @param {function} next Callback passed an error if any
     */
    payload(next) {
      if (!!this._payload.buff) {
        zlib.gunzip(this._payload.buff, (err, buff) => {
          if (!!err) {
            if (_.isFunction(next)) {
              next(err);
            } else {
              throw err;
            }
          } else {
            const jsonStr = buff.toString('ascii');
            this._payload.decoded = JSON.parse(jsonStr);

            delete this._payload.buff;

            if (_.isFunction(next)) {
              next(null, this._payload.decoded);
            }
          }
        });
      } else if (!!this._payload.decoded) {
        if (_.isFunction(next)) {
          next(null, this._payload.decoded);
        }
      } else {
        let err = new TypeError('No payload buffer or decoded value?');
        if (_.isFunction(next)) {
          next(err);
        } else {
          throw err;
        }
      }
    }
  }

  class Client {

    /**
     * Handler for errors
     * @callback ErrorCallback
     * @param {express~Response} Express response object
     * @param {Error} err
     */

    /**
     * Status handler that gets status as a string and the information around sending.
     * @callback StatusCallback
     * @param {String} status Message
     * @param {express~Request} Sender information
     */

    /**
     * Handler when data is received, it gets a buffer of uncompressed data.
     * @callback DataCallback
     *
     * @param {Data} data Data from the streaming service
     * @param {express~Request} req Information about original data buffer
     */

    /**
     * Create a new client within the express app, `config.app`.
     *
     * @param {express} config.app Parent express application
     * @param {String} [config.remote='http://cs9864-2016.csd.uwo.ca:80/'] Address of endpoint
     * @param {Number} [config.timeout=15000] Milliseconds to wait between requests
     * @param {String} [config.local.baseRoute='/'] Base for all routes for subapp to be installed, slash terminated
     * @param {String} [config.secret] {String} Secret token used for server commands, if not specified, server commands will error
     *
     * @param {ErrorCallback} [config.handlers.error]
     * @param {StatusCallback} [config.handlers.status]
     * @param {DataCallback} [config.handlers.data]
     */
    constructor(config) {

      assert(!!config.app);

      config = _.defaultsDeep(config, {
        local: {
          baseRoute: '/'
        },
        remote: url.parse('http://cs9864-2016.csd.uwo.ca:80/'),
        timeout: 15000,
        handlers: {
          error: (resp, err) => {
            if (!!err) {
              w.error(err.toString());
            }
          },

          status: (status, req) => {
            console.log('[%s]: SIGNAL: %s\n',
              req.ip, status);
          },

          data: (data, req) => {
            data.payload((err, payload) => {
              console.log('[%s]: Received %d rows\n',
                req.ip, payload.length);
            });
          }
        }
      });

      this._remote = (_.isString(config.remote) ? url.parse(config.remote) : config.remote);
      this._local = {
        protocol: 'http:',
        pathname: config.local.baseRoute
      };

      this._secret = config.secret;

      /**
       * How long to wait before timing out with requests (milliseconds)
       * @type {number}
       */
      this.timeout = config.timeout;

      /**
       * Handlers information
       *
       * @type {{error: (ErrorCallback), status: (StatusCallback), data: (DataCallback)}}
       * @private
       */
      this._handlers = config.handlers;

      // Build the express sub-app
      this._app = express();
      const app = this._app;
      app.use(bodyParser.json());
      
      const handlers = this._handlers;

      app.post('/data', (req, resp) => {

        resp.json({
          success: true
        });

        handlers.data(new Data(req.body), req);
      });

      app.post('/signal', (req, resp) => {
        resp.json({
          success: true
        });

        handlers.status(req.body.signal, req);
      });

      const old = config.app.listen;
      const that = this;
      // Install the sub-app
      config.app.listen = function (port, hostname, backlog, callback) {
        let _port = port;
        let _hostname = _.isString(hostname) ? hostname : undefined;
        let _backlog = _.isNumber(hostname) ? hostname : (_.isNumber(backlog) ? backlog : undefined);
        let _callback = _.isFunction(hostname) ? hostname : (_.isFunction(backlog) ? backlog : (_.isFunction(callback) ? callback : function() {}));

        return old.call(this, _port, _hostname, _backlog, function () {
          config.app.use(config.local.baseRoute, app);

          that._local.port = _port;

          _callback.apply(this, arguments);
        });
      };
    }

    get app() { return this._app; }

    get endpoint() { return url.format(this._remote); }

    _remoteUrl(path, query) {
      return url.format(_.merge(_.clone(this._remote), {
        pathname: path,
        query: query
      }));
    }

    /**
     * Connect to the streaming service, this will register with the end point and bind to the requested port.
     * @param {errorCallback} next Called after binding
     */
    connect(next) {
      const req = {
        uri: this._remoteUrl('/register'),
        json: { href: this._local, verb: 'POST' },
        timeout: this.timeout
      };

      request.put(req, (err, resp, body) => {
        if (!err) {
          if (resp.statusCode != 200) {
            err = new Error("Bad status code: " + resp.statusCode + '\nError: ' + util.inspect(body));
          }
        }

        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      });
    }

    /**
     * Disconnect from the service
     * @param {errorCallback} [next]
     */
    disconnect(next) {
      const req = {
        url: this._remoteUrl('/register'),
        json: { href: this._local, verb: 'POST' },
        timeout: this.timeout
      };

      request.del(req, err => {
        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      });
    }

    /**
     * Start the service streaming
     * @param {ErrorCallback} [next]
     */
    start(next) {
      if (!this._secret) {
        let err = new Error('Secret is not specified, server requests are unavailable.');
        if (_.isFunction(next)) {
          next(err);
        } else {
          throw err;
        }
      }

      const uri = this._remoteUrl('/serv/start', { 'token': this._secret });

      request.get({
        url: uri,
        timeout: this.timeout
      }, (err, resp, body) => {
        if (!err) {
          if (resp.statusCode != 200) {
            err = new Error("Bad status code: " + resp.statusCode + '\nError: ' + body);
          }
        }

        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      });
    }

    /**
     * Start the service streaming
     * @param {ErrorCallback} [next]
     */
    stop(next) {
      if (!this._secret) {
        let err = new Error('Secret is not specified, server requests are unavailable.');
        if (_.isFunction(next)) {
          next(err);
        } else {
          throw err;
        }
      }

      const uri = this._remoteUrl('/serv/stop', { 'token': this._secret });

      request.get({
        url: uri,
        timeout: this.timeout
      }, (err, resp, body) => {
        if (!err) {
          if (resp.statusCode != 200) {
            err = new Error("Bad status code: " + resp.statusCode + '\nError: ' + body);
          }
        }

        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      });
    }

    /**
     * Restart the streaming service with an optional date, `when`.
     * @param {ErrorCallback} [next]
     * @param {moment} [when]
     */
    restart(next, when) {
      if (!this._secret) {
        let err = new Error('Secret is not specified, server requests are unavailable.');
        if (_.isFunction(next)) {
          next(err);
        } else {
          throw err;
        }
      }


      const uri = this._remoteUrl('/serv/reset', {
        'token': this._secret,
        'date': (moment.isMoment(when) ? when.format('YYYY-MM-DD[T]hh:mm:ss') : undefined)
      });

      request.get({
        url: uri,
        timeout: this.timeout
      }, (err, resp, body) => {
        if (!err) {
          if (resp.statusCode != 200) {
            err = new Error("Bad status code: " + resp.statusCode + '\nError: ' + body);
          }
        }

        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      });
    }


    /**
     *
     * @param {String} event
     * @param {(ErrorCallback|StatusCallback|DataCallback)} handler Handler
     */
    on(event, handler) {
      assert(_.isString(event) && _.isFunction(handler));

      switch (event) {
        case 'error': {
          this._handlers.error = handler;
        } break;

        case 'status': {
          this._handlers.status = handler;
        } break;

        case 'data': {
          this._handlers.data = handler;
        } break;

        default: {
          this._handlers.error(new Error('Unknown event: ' + event));
        }
      }
    }

  }

  return {
    StockClient: Client
  };
};


