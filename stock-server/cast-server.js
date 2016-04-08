'use strict';

const assert = require('assert');
const util = require('util');
const zlib = require('zlib');

const _ = require('lodash');

module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));

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
        endpoints: []
      });

      this._state = STATE.RUNNING;

      this._endpoints = config.endpoints;
    }

    get endPoints() {
      return this._endpoints;
    }

    start(next) {
      this._state = STATE.RUNNING;

      if (_.isFunction(next)) {
        next();
      }
    }

    stop(next) {
      this._state = STATE.STOPPED;

      if (_.isFunction(next)) {
        next();
      }
    }

    _epIdx(endPoint) {
      const srch = endPoint.href('');
      return this._endpoints.findIndex(elem => (elem.href('') === srch));
    }

    /**
     * Check if an `EndPoint` is registered.
     * @param {EndPoint} endPoint Search term
     * @returns {boolean} True if registered
     */
    isEndPointRegistered(endPoint) {
      return this._epIdx(endPoint) > -1;
    }

    registerEndPoint(endPoint, next) {
      if (this._epIdx(endPoint) === -1) {
        this._endpoints.push(endPoint);
      }

      if (_.isFunction(next)) {
        next();
      }
    }

    /**
     * Unregisters an endPoint from receiving messages.
     * @param {EndPoint} endPoint Address to send data to
     * @param next Called when the end point is removed
     */
    unregisterEndPoint(endPoint, next) {
      const idx = this._epIdx(endPoint);

      if (idx >= 0) {
        this._endpoints.splice(idx, 1);
        w.debug(`Removed endpoint: ${endPoint}, eps = ${this.endPoints}`);
      }

      if (_.isFunction(next)) {
        next();
      }
    }

    /**
     * Sends a compressed JSON object to the end points
     * @param jsonMsg
     * @param next
     */
    send(jsonMsg, next) {
      let errorHappened = false;
      let nafter = _.after(this._endpoints.length, () => {
        w.silly(`Sent message to all endpoints, errors: ${errorHappened}`);
      });

      this._endpoints.forEach(ep => {
        ep.send({
          path: '/data',
          data: jsonMsg,
          next: err => {
            if (!!err) {
              if (this.isEndPointRegistered(ep)) {
                // Only do this if the endPoint is still registered, its suuuper spammy as 15+ errors blow out
                // the logs.
                w.warn(`Failed to send to: ${ep}, removing.\nError: ${err}`);
                this.unregisterEndPoint(ep);
              }

              // still register that it happened though, for record keeping. :D
              errorHappened = true;
            }

            nafter();
          }
        });
      });

      if (_.isFunction(next)) {
        next();
      }
    }

    signal(msg, next) {
      let nafter = _.after(this._endpoints.length, () => {
        w.silly(`Sent SIGNAL to all end points: ${util.inspect(msg)}`);
      });

      // iterate over all of the endpoints
      this._endpoints.forEach(ep => {
        // for each port, we send a message
        ep.send({
          path: '/signal',
          data: msg ,
          next: err => {
            if (!!err) {
              w.warn(`Failed to send to: ${ep}, removing.\nError: ${err}`);
              this.unregisterEndPoint(ep);
            }

            nafter();
          }
        });
      });

      if (_.isFunction(next)) {
        next();
      }
    }
  }
  
  return Server;
};
