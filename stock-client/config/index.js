'use strict';

const util = require('util');

const cfenv = require('cfenv');
const _ = require('lodash');


let vcap;
let config;
if (!!process.env['VCAP_APP_PORT']) {
  // bluemix
  config = require('./config.bluemix.json');

  vcap = _.extend(cfenv.getAppEnv());
  _.each(config.vcap.services, (v, key) => {
    vcap.services[key] = v;
  });
} else {
  config = require('./config.local.json');

  vcap = _.extend(cfenv.getAppEnv({ vcap: config.vcap }));
}

vcap = _.extend(vcap, {
  locals: config.locals
});

console.log(vcap.getServices());

console.log("cloudant url:", vcap.getServiceURL("Cloudant NoSQL DB-i3", { auth: ["username", "password"]}));
console.log("stock-server url:", vcap.getServiceURL("stock-server"));


module.exports = vcap;
