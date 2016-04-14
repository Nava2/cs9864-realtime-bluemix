'use strict';

const assert = require('assert');
const url = require('url');

const _ = require('lodash');
const request = require('request');

const safe = require('./safe-callback');

module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));

  class EndPoint {

    /**
     * Create a new Endpoint instance
     *
     * @param {string} [config.href] URL to connect to, if specified, takes precedence.
     * @param {String} [config.verb='POST'] Verb used with #send()
     * @param {function(EndPoint)} [config.failure.handler=null] Handler called when the endpoint fails
     * @param {number} [config.failure.threshold=3] How many **sequential** fails required before the end point fails.
     */
    constructor(config) {

      config = _.defaults(config, {
        verb: 'POST',
        protocol: 'http:',
        port: 80,
        pathname: '/',

        failure: {
          handler: null,
          threshold: 3
        }
      });

      if (!!config.href) {
        config = _.extend(config, url.parse(config.href));
      }

      assert(config.verb === 'POST' || config.verb === 'PUT');

      /**
       * marks how many failures have happened recently
       * @type {number}
       * @private
       */
      this._failCount = 0;

      /**
       * The number of failures required for the EndPoint to "fail".
       * @type {number}
       */
      this.failureThreshold = config.failure.threshold;
      this._onFailure = config.failure.handler;

      this._verb = config.verb;
      this._timeout = 15000;

      this._href = url.parse(url.format(config));

    }

    href(path) {
      return url.format(_.defaults({
        pathname: this._href.pathname + path
      }, this._href));
    }

    /**
     * Set the failure handler
     * @param fn
     */
    set onFailure(fn) {
      assert(_.isFunction(fn));

      this._onFailure = fn;
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

    toJson() {
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
      const next = safe(parameters.next);

      let send;

      let rnext = (err, resp) => {
        let resend = false;
        
        // fire and forget, so ignore response data
        if (!err && !!resp) {

          // handle status codes
          switch (resp.statusCode) {
            case 503:
              w.debug(`Received gateway error 503, attempting to resend {${path}, failCount = ${this._failCount}`);

              this._failCount++;

              resend = true;
              break;

            case 200:
              this._failCount = 0;
              break;

            default:
              // bad!
              this._failCount++;
              err = new Error(`Bad status code: ${this.verb} ${path} = ${resp.statusCode}`);
              break;
          }
        }

        if (!!err) {
          w.warn('Error sending -> %s. [%s]', path, err);

          if (_.has(err, 'code')) {// critical errors:
            switch (err.code) {
              case 'ECONNREFUSED':
              case 'ETIMEOUT':
              {
                // force it to fail
                w.debug("Error has code '%s', failing endpoint.", err.code);
                
                this._failCount = this.failureThreshold;
              } break;

              default:
                break;
            }
          }


        }
        
        if (resend) {
          
          // we are resending the packet, this will cause this function to be recalled, thus 
          // we don't need to worry about the callback
          send();
          
        } else {

          if (this._failCount >= this.failureThreshold) {
            if (!!this._onFailure) {
              this._onFailure(this);
            }
          }

          // not resending now
          next(err);
        }

      }; // end rnext

      if (!data) {
        rnext(new TypeError('Invalid input, must specify string or JSON data.'), null);
      }

      send = () => {
          request({
            url: path,
            method: this.verb,
            json: (_.isString(data) ? { payload: data } : data),
            timeout: this.timeout
          }, rnext);
        };

      // now that it's defined, call it :)
      send();

    }
  }

  return EndPoint;
};
