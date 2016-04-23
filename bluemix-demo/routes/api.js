'use strict';

const url = require('url');
const util = require('util');

const express = require('express');
const router = express.Router();

const _ = require('lodash');
const Chance = require('chance');
const moment = require('moment');
const request = require('request');

const config = require('../config');

const remoteHref = config.isLocal ? {
  protocol: "http:",
  hostname: config.locals.client.hostname,
  port: config.port,
  pathname: config.locals.client.pathname
} : config.url + config.locals.client.pathname;
// const remoteUrl = url.format(_.isString(config.remote.href) ? url.parse(config.remote.href) : config.remote.href);


module.exports = (store, winston) => {

  let g_tickers = [];
  let g_data = {};

  const w = (!!winston ? winston : require('winston'));
  const chance = new Chance();

  w.info("Config = %s", util.inspect(config));

  function checkId(res, id, next) {
    if (!_.isString(id)) {
      res.status(503).json({
        success: false,
        err: "Invalid ID"
      });
    } else {
      // id is

      if (!_.has(g_data, id)) {
        res.status(404).json({
          success: false,
          err: "Invalid ID passed",
          id: id
        });
      } else {
        let data = g_data[id];
        next(data);
      }
    }
  }
  
  function updateGTickers() {
    let all = _.chain(g_data).map(data => (data.tickers)).flatten().uniq().value();
    
    if (!_.isEqual(all, g_tickers)) {
      // update registry
      request.put({
        url: config.getServiceURL("stock-client") + 'register',
        json: {
          href: remoteHref,
          verb: config.locals.client.verb,
          tickers: all
        }
      }, (err, res, body) => {
        if (!!err) {
          throw err;
        }
        w.info(util.inspect(body));

        if (!!body.success) {
          // successfully registered :3
          g_tickers = all;
        } else {
          w.warn("wtf? %s", body.err);
        }
      });
    }
  }
  
  router.post('/data', (req, res) => {
    /* {
    when: data.when.format('YYYY-MM-DDThh:mm:ss'),
      tickers: validTickers,
      payload: _.pick(payload, validTickers)
  } */

    res.json({success: true});

    const body = req.body;
    const tickers = body.tickers.map(_.lowerCase);
    const when = moment(body.when, "YYYY-MM-DDThh:mm:ss");
    let now = {
      date: when.format("YYYY-MM-DD"),
      time: when.format("hh:mm:ss")
    };

    _.each(g_data, data => {
      // intersect the body tickers with the "data" tickers
      let int = _.intersection(tickers, data.tickers.map(_.lowerCase));
      if (int.length > 0) {
        // have tickers we care about

        int.forEach(t => {
          body.payload[t].forEach(v => {
            data.stocks.push(_.extend(_.clone(v), {
              ticker: t,
              when: now
            }));
          });
        });
      }
    });
  });

  router.post('/client', (req, res) => {
    const id = chance.guid();

    g_data[id] = {
      last: moment(),
      tickers: [],
      stocks: []
    };

    res.json({
      id: id,
      success: true
    });
  });

  router.delete('/client', (req, res) => {
    const id = req.body.id;

    checkId(res, id, () => {
      delete g_data[id];

      res.json({
        id: id,
        success: true
      });

      updateGTickers();
    });
  });

  router.get('/tickers', (req, res) => {
    const id = req.body.id;

    checkId(res, id, (data) => {
      res.json({
        success: true,
        tickers: data.tickers
      });
    });
  });

  router.post('/tickers', (req, res) => {
    const id = req.body.id;
    const tickers = req.body.tickers.map(_.upperCase);

    checkId(res, id, (data) => {
      let ch = false;
      tickers.forEach(t => {
        const idx = data.tickers.indexOf(t);
        if (idx == -1) {
          data.tickers.push(t);
          ch = true;
        }
      });

      res.json({
        success: true,
        tickers: data.tickers
      });

      if (ch) {
        updateGTickers();
      }
    });
  });

  router.put('/tickers', (req, res) => {
    const id = req.body.id;
    const tickers = req.body.tickers.map(_.upperCase);

    checkId(res, id, (data) => {
      data.tickers = tickers;

      res.json({
        success: true,
        tickers: data.tickers
      });

      updateGTickers();
    });
  });

  router.delete('/tickers', (req, res) => {
    const id = req.body.id;
    const tickers = req.body.tickers.map(_.upperCase);

    checkId(res, id, (data) => {
      let ch = false;
      tickers.forEach(t => {
        const idx = data.tickers.indexOf(t);
        if (idx != -1) {
          data.tickers.splice(idx, 1);
          ch = true;
        }
      });

      res.json({
        success: true,
        tickers: data.tickers
      });

      if (ch) {
        updateGTickers();
      }
    });
  });


  router.get('/fetch', (req, res) => {

    const id = req.query.id;

    checkId(res, id, data => {

      res.json({
        success: true,
        stocks: data.stocks
      });

      if (data.stocks.length > 0) {
        w.silly("Data was stored!");
      }

      data.stocks = [];
      data.last = moment();
    });

  });
    
  // cleanup!
  setInterval(() => {
    const now = moment();
    _.each(g_data, (data, id) => {
      if (data.last.diff(now) > 45 * 1000) { // clean 60s
        delete g_data[id];
      }

    });
  }, 30 * 1000);

  return router;
};
