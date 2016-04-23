'use strict';

const util = require('util');

const cfenv = require('cfenv');
const _ = require('lodash');

let vcap;
let config;
if (!!process.env['VCAP_APP_PORT']) {
  // bluemix
  config = require('./config.bluemix.json');

  vcap = cfenv.getAppEnv();
  _.each(config.vcap.services, (v, key) => {
    vcap.services[key] = v;
  });
} else {
  config = require('./config.local.json');

  vcap = cfenv.getAppEnv({ vcap: config.vcap });
}

vcap["locals"] = config.locals;

module.exports = vcap;
