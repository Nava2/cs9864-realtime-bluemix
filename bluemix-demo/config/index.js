'use strict';

let config;
if (!!process.env['VCAP_APP_PORT']) {
  // bluemix
  config = require('./config.bluemix.json');

  let vcap = JSON.parse(process.env['VCAP_APPLICATION']);
  config.local.href.hostname = vcap.uris[0];

  console.log("vcap = %s", JSON.stringify(vcap, null, '\t'));
} else {
  config = require('./config.local.json');
}

module.exports = config;
