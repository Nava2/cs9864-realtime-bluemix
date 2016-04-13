'use strict';

const assert = require('assert');
const url = require('url');

const _ = require('lodash');
const request = require('request');

module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));

  class EndPoint {

    constructor(config) {

      config = _.defaults(config, {
        verb: 'POST',
        protocol: 'http:',
        port: 80,
        pathname: '/'
      });

      assert(config.verb === 'POST' || config.verb === 'PUT');

      this._href = url.parse(url.format(config));
      this._verb = config.verb;
      this._timeout = 15000;
    }

    href(path) {
      return url.format(_.defaults({
        pathname: this._href.pathname + path
      }, this._href));
    }

    /**
     * Get the verb used with #send()
     * @returns {string}
     */
    get verb() { return this._verb; }

    /**
     * Get the hostname sent to
     * @returns {string}
     */
    get hostname() { return this._href.hostname; }

    /**
     * Get the pathname sent to
     * @returns {string}
     */
    get pathname() { return this._href.pathname; }

    /**
     * Get the port number used
     * @returns {number}
     */
    get port() { return this._href.port; }

    get timeout() { return this._timeout; }

    toString() {
      return `EndPoint{href='${this.href('')}, verb='${this.verb}'}`;
    }

    get json() {
      return {
        verb: this.verb,
        protocol: this._href.protocol,
        hostname: this.hostname,
        pathname: this.pathname,
        port: this.port
      };
    }

    /**
     * Sends data to the end point.
     * @param {String} parameters.path Path at the end of the end point to add
     * @param {Object} [parameters.data] JSON data to send
     * @param {function} [parameters.next] Called if an error happens, not otherwise.
     */
    send(parameters) {
      const path = this.href(parameters.path);
      const data = parameters.data;
      const next = parameters.next;

      let rnext = (err, resp) => {
        // fire and forget, so ignore response data
        if (!err && (!!resp && resp.statusCode !== 200)) {
          err = new Error(`Bad status code: ${this.verb} ${path} = ${resp.statusCode}`);
        }

        if (!!err) {
          w.warn('Error in sending to %s. {e = %s}', this.toString(), err);
        }

        if (_.isFunction(next)) {
          next(err);
        } else if (!!err) {
          throw err;
        }
      };

      if (!!data) {
        request({
          url: path,
          method: this.verb,
          json: (_.isString(data) ? { payload: data } : data),
          timeout: this.timeout
        }, rnext)
      } else {
        rnext(new TypeError('Invalid input, must specify string or JSON data.'), null);
      }
    }
  }

  return EndPoint;
};
