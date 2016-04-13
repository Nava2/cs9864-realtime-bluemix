'use strict';

const assert = require('assert');
const url = require('url');

const _ = require('lodash');
const request = require('request');

module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));

  class EndPoint {

    constructor(config) {

      assert(!!config.href);

      config = _.defaults(config, url.parse(config.href), {
        verb: 'POST',
        protocol: 'http:',
        port: 80,
        pathname: '/'
      });

      assert(config.verb === 'POST' || config.verb === 'PUT');

      this._href = config;

      this._timeout = 15000;
    }

    href(path) {
      return url.format(_.defaults({
        pathname: this._href.pathname + path
      }, this._href));
    }

    get verb() { return this._href.verb; }

    get timeout() { return this._timeout; }

    toString() {
      return `EndPoint{href='${this.href('')}, verb='${this.verb}'}`;
    }

    /**
     * Sends data to the end point.
     * @param {String} parameters.path Path at the end of the end point to add
     * @param {Object} [parameters.data] JSON data to send
     * @param {function} parameters.next Called if an error happens, not otherwise.
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
