'use strict';

const _ = require('lodash');

let config;
if (_.has(process.env, 'CSD_SERVICE') && !!process.env['CSD_SERVICE']) {
  // csd server
  config = require('./config.csd.json');
} else {
  config = require('./config.local.json');
}

module.exports = config;
