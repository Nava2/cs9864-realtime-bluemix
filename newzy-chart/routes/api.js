'use strict';

const url = require('url');
const util = require('util');

const express = require('express');
const router = express.Router();

const _ = require('lodash');
const Chance = require('chance');
const moment = require('moment');
const request = require('request');

const async = require('async');

const config = require('blue-config')(__dirname + '/../config');

// const remoteUrl = url.format(_.isString(config.remote.href) ? url.parse(config.remote.href) : config.remote.href);


module.exports = (winston) => {

  const w = (!!winston ? winston : require('winston'));
  const chance = new Chance();

  w.info("Config = %s", util.inspect(config));

  router.post('/new', (req, resp) => {

    // TODO REPLACE WITH REAL QUERY
    resp.json({
      success: true,
      id: chance.guid()
    });

  });

  // const DATA_URI = config.getServiceURL("stock-source") + 'data';
  const DATA_URI = config.getServiceURL("stock-source") + 'getDataSince';

  router.get('/fetch', (req, resp) => {

    // asynchronously fetch all of the requested tickers then join the async requests together and return the json
    // result

    const ID = req.query.id;
    const TICKERS = req.query.tickers;
    if (!ID && !!TICKERS) {
      resp.json({
        success: false,
        error: "Must specify ID"
      });
    } else if (!!ID && !TICKERS) {
      resp.json({
        success: false,
        error: "Must specify tickers to query"
      });
    } else if (!ID && !TICKERS) {
      resp.json({
        success: false,
        error: "Must specify ID and tickers"
      });
    } else {

      // The parameters are correct
      w.debug("Querying TICKERS =", TICKERS);

      async.map(TICKERS, (ticker, cb) => {
        request.get({
          uri: DATA_URI,
          qs: {
            // id: ID,
            // ticker: ticker
            guid: ID,
            stockname: ticker
          },
          json: true
        }, (err, res, body) => {
          if (!!err) {
            cb(err, []);
          } else if (res.statusCode !== 200) {
            cb(new Error(`Bad status code ${res.statusCode} for ${ticker}`), []);
          } else {
            // Good!
            cb(err, [ticker, body]);
          }
        });
      }, (err, data) => {
        if (!!err) {
          // an error happened somewhere
          resp.json({
            success: false,
            errors: err
          });
        } else {

          // No error, jsut return the results
          const out_json = {
            success: true,
            data: _(data).map((pair) => {
              return [pair[0], _.extend(pair[1].data, { time: pair[1].time})];
            }).fromPairs()
          };

          resp.json(out_json);
        }
      }); // end of async
    } // end of good parameters
  });

  return router;
};
