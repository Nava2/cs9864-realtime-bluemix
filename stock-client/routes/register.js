'use strict';

const url = require('url');

const _ = require('lodash');
const express = require('express');

module.exports = (winston) => {
  const w = (!!winston ? winston : require('winston'));
  if (!!process.env['LOG_LEVEL']) {
    w.level = process.env['LOG_LEVEL'];
  }

  const router = express.Router();
  const EndPoint = require('../lib/endpoint')(w);

  router.put('/register', function(req, res) {
    const ep = new EndPoint({
      href: (!_.isString(req.body.href) ? _.defaults(req.body.href, { hostname: req.ip }) : url.parse(req.body.href)),
      verb: req.body.verb
    });

    req.app.locals.mgr.addEndPoint({
      tickers: req.body.tickers,
      endpoint: ep
    }, err => {
      if (!!err) {
        res.status(403).json({
          success: false,
          error: err
        });
      } else {
        w.debug(`app.js: Registered ${ep.toString()}`);

        res.json({
          success: true
        });
      }
    });
  });

  router.delete('/register', function(req, res) {
    const ep = new EndPoint({
      href: (!_.isString(req.body.href) ? url.format(_.extend(req.body.href, { hostname: req.ip })) : req.body.href),
      verb: req.body.verb
    });

    req.app.locals.mgr.removeEndpoint(ep, err => {
      if (!!err) {
        res.status(403).json({
          success: false,
          error: err
        });
      } else {
        w.debug(`app.js: Unregistered ${ep.toString()}`);
        res.json({
          success: true
        });
      }
    });
  });

  return router;
};

