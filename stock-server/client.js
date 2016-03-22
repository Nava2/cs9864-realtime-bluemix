'use strict';

const assert = require('assert');
const w = require('winston');
const _ = require('lodash');
const zlib = require('zlib');
const dns = require('dns');

const cfg = require('./config.json');

const dgram = require('dgram');

const request = require('request');

class Client {

  /**
   * Handler for errors
   * @callback ErrorCallback
   */

  /**
   * Status handler that gets status as a string and the information around sending.
   * @callback StatusCallback
   * @param status {String} Message
   * @param rinfo {{address: String, port: Number}} Sender information
   */

  /**
   * Handler when data is received, it gets a buffer of uncompressed data.
   * @callback DataCallback
   * @param buff {Buffer} Uncompressed data
   * @param info {{compressedSize: Number, uncompressedSize: Number}} Information about original data buffer
   * @param sinfo {{address: String, port: Number}} Sender information
   */

  /**
   * Create a new client
   *
   * @param config Configuration data
   * @param [config.endpoint='http://cs9864-2016.csd.uwo.ca/'] {String} Address of endpoint
   * @param [config.port=80] {Number} Port to use for streaming data
   * @param [config.secret] {String} Secret token used for server commands, if not specified, server commands will error
   */
  constructor(config) {
    config = _.defaults(config, {
      endpoint: 'http://cs9864-2016.csd.uwo.ca/',
      port: 64646
    });

    this._endpoint = config.endpoint;
    this._port = config.port;

    /**
     * Handlers information
     *
     * @type {{error: (ErrorCallback), status: (StatusCallback), data: (DataCallback)}}
     * @private
     */
    this._handlers = {

      error: err => {
        if (!!err) {
          throw err;
        }
      },

      status: (status, rinfo) => {
        console.log('%s:%d :: SIGNAL: %s\n',
          rinfo.address, rinfo.port, status);
      },

      data: (rows, info, sinfo) => {
        console.log('%s:%d :: Received %d (%d, cmp: %dx) bytes, %d rows\n',
          sinfo.address, sinfo.port,
          info.compressedSize, info.uncompressedSize,
          Math.round(info.compressedSize / info.uncompressedSize),
          rows.length);
      }
    };

    this._socket = dgram.createSocket('udp4');
    this._socket.on('message', (mbuff, rinfo) => {
      if (mbuff.slice(0, 3).toString('ascii') === 'SIG') {
        this._handlers.status(msg.slice(5).toString('ascii'), rinfo);
      } else {
        const msgL = msg.length;
        zlib.gunzip(msg, (err, data) => {
          let strd = data.toString('ascii');
          let rows = strd.split('\n');

          this._handlers.data(rows, { compressedSize: msgL, uncompressedSize: strd.length }, rinfo);
        });
      }
    });
    this._socket.on('error', err => {
      let next = () => { this._handlers.error(err); };

      this._socket.close(next);
    });
  }

  get endpoint() { return this._endpoint; }
  get port() { return this._port; }

  /**
   * Register for the service
   * @param next {ErrorCallback}
   * @private
   */
  _register(next) {
    request.put(this._endpoint + '/register?port=' + this.port, err => {
      if (_.isFunction(next)) {
        next(err);
      } else if (!!err) {
        throw err;
      }
    });
  }

  /**
   * Unregister from the service
   * @param next {ErrorCallback}
   * @private
   */
  _unregister(next) {
    request.del(this._endpoint + '/register?port=' + this.port, err => {
      if (_.isFunction(next)) {
        next(err);
      } else if (!!err) {
        throw err;
      }
    });
  }



  /**
   * Connect to the streaming service, this will register with the end point and bind to the requested port.
   * @param next {errorCallback} Called after binding
   */
  connect(next) {
    this._register(err => {
      if (!!err) {
        // error happened
        if (_.isFunction(next)) {
          next(err);
        } else {
          throw err;
        }
      }

      this._socket.bind({
        address: '127.0.0.1',
        port: this._port
      }, next);
    });
  }

  /**
   * Disconnect from the service
   * @param next {errorCallback}
   */
  disconnect(next) {
    this._unregister(err => {
      if (!!err) {
        // error happened
        if (_.isFunction(next)) {
          next(err);
        } else {
          throw err;
        }
      }

      this._socket.close(next);
    });
  }


  /**
   *
   * @param {String} event
   * @param {(ErrorHandler|StatusHandler|DataHandler)} handler Handler
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

let client = new Client({
  secret: cfg.secret
});

client.connect(() => {
  console.log("Connected!");
});


