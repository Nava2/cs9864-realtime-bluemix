'use strict';

const path = require('path');

const express = require('express');
const router = express.Router();

const _ = require('lodash');
const request = require('request');

const config = require('blue-config')(path.join(__dirname, '..', 'config'));

/* GET home page. */
router.get('/', (req, res) => {

  request.get({
    uri: config.url + '/api/list',
    json: true
  }, (err, resp, body) => {
    if (!!err) {
      res.render('error', {
        message: "Server problem.",
        error: err.message
      });
    } else {
      res.render('index', {
        list: _.map(body, (v, i) => (_.extend(v, {idx: i+1})))
      });
    }
  });
});

module.exports = router;
