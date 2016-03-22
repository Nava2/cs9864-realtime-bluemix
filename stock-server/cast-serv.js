'use strict';

const dgram = require('dgram');
const zlib = require('zlib');
const assert = require('assert');

const _ = require('lodash');


module.exports = (winston) => {

  const w = winston;


  const STATE = {
    RUNNING: 0,

    STOPPED: 2
  };

  class Server {
    static idx(i) {
      return ("000000" + i.toString(16)).substr(-6);
    }

    constructor(config) {

      config = _.defaults(config, {
        addr: '0.0.0.0'
      });
      assert(!!config.port);

      this._server = dgram.createSocket('udp4');
      this._server.on('error', err => {
        console.log(`server error:\n${err.stack}`);
        this._server.close();
      });

      this._addr = config.addr;
      this._port = config.port;

      this._state = STATE.RUNNING;

      this._endpoints = {};
      this._epCount = 0;
    }

    get port() {
      return this._port;
    }

    start(next) {
      this._server.bind({
        address: this.addr,
        exclusive: true
      }, err => {
        if (!!err) {
          throw err;
        }
        this._state = STATE.RUNNING;

        if (_.isFunction(next)) {
          next();
        }
      });
    }

    stop(next) {
      this._state = STATE.STOPPED;
      this._server.close(err => {
        if (!!err) {
          throw err;
        }

        if (_.isFunction(next)) {
          next();
        }
      });
    }

    registerEndPoint(address, port, next) {
      if (this._endpoints.hasOwnProperty(address)) {
        // address already registered
        this._endpoints[address].add(port);
      } else {
        this._endpoints[address] = new Set([port]);
      }

      this._epCount++;

      if (_.isFunction(next)) {
        next();
      }
    }

    /**
     * Unregisters an endPoint from receiving messages.
     * @param address IP address to remove
     * @param [port] {Number}
     * @callback next Called when the end point is removed
     */
    unregisterEndPoint(address, port, next) {
      let nnext = (_.isFunction(port) ? port : next);
      port = (_.isNumber(port) ? port : undefined);

      let ep = this._endpoints[address];
      let err;
      if (!!ep) {
        if (!!port) {
          // port is specified
          if (ep.has(port)) {
            ep.delete(port);
            this._epCount--;

            if (ep.length == 0) {
              delete this._endpoints[address];
            }
          } else {
            err = new Error(`Can not remove port, ${port}, from ${address} because the port is not registered.`);
          }
        } else {
          this._epCount -= ep.length;
          delete this._endpoints[address];
        }

      } else {
        if (!!port) {
          err = new Error(`Can not remove port, ${port}, from ${address} because the address is not registered.`);
        } else {
          err = new Error(`Can not remove ${address} because it is not registered.`);
        }
      }

      if (_.isFunction(nnext)) {
        nnext(err);
      } else {
        throw err;
      }
    }

    send(msg, next) {
      let buff = new Buffer(msg, 'ASCII');
      zlib.gzip(buff, { level: 7 }, (err, cbuff) => {
        const buffL = cbuff.length;

        let nafter = _.after(this._epCount, () => {

          w.debug(`Sent ${buffL} bytes to all addresses`);
          if (_.isFunction(next)) {
            next();
          }
        });

        // iterate over all of the endpoints
        _.forEach(this._endpoints, (ports, addr) => {
          // for each port, we send a message
          ports.forEach(port => {
            this._server.send(buff, 0, buff.length, port, addr, err => {
              if (!!err) {
                throw err;
              }

              w.debug(`Sent ${buffL} bytes on ${addr}:${port}`);

              nafter();
            });
          });
        });
      });
    }

    signal(msg, next) {
      let buff = new Buffer(`SIG::${msg}`, 'ASCII');
      
      let nafter = _.after(this._epCount, () => {
        w.debug(`Sent ${msg} to all end points`);
        if (_.isFunction(next)) {
          next();
        }
      });

      // iterate over all of the endpoints
      _.forEach(this._endpoints, (ports, addr) => {
        // for each port, we send a message
        ports.forEach(port => {
          this._server.send(buff, 0, buff.length, port, addr, err => {
            if (!!err) {
              throw err;
            }

            nafter();
          });
        });
      });
    }
  }


  return {
    Server: Server,
    idx: Server.idx
  };
};
