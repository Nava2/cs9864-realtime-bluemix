'use strict';

let config;
if (!!process.env.VCAP_APP_PORT) {
  // bluemix
  config = require('./config.bluemix.json');
} else {
  config = require('./config.local.json');
}

module.exports = config;
