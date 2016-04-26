var express = require('express');
var router = express.Router();

const _ = require('lodash');
const request = require('request');

const config = require('../config');
const URI = config.getServiceURL('service-registry') + 'listall';

/* GET home page. */
router.get('/', function(req, res, next) {

  request.get({
    uri: URI,
    json: true
  }, (err, resp, body) => {
    if (!!err) {
      res.render('error', {
        message: "Server failure",
        error: body.error
      });
    } else {
      res.render('index', {
        list: _.map(body, (v, i) => (_.extend(v, {idx: i+1})))
      });
    }
  });
});

module.exports = router;