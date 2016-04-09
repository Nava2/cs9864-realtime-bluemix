'use strict';

const url = require('url');

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const logger = require('morgan');
const compression = require('compression');

const w = require('winston');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const moment = require('moment');

const cfg = require('./config.json');

const EndPoint = require('./endpoint')(w);

const app = express();

if (app.get('env') === 'development') {
  w.level = 'debug';
} else if (!!process.env['LOG_LEVEL']) {
  w.level = process.env['LOG_LEVEL'];
}

w.add(w.transports.File, { filename: './server-log.log' });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression());
app.use(logger('dev'));

const PublishService = require('./publish')(w);

const pubserv = new PublishService(cfg);

function infoJson() {
  return {
    'nowish': pubserv.history.nowish,
    'state': pubserv.state
  };
}

app.get('/info', (req, res, next) => {
  res.json(infoJson());
});

app.get('/now', (req, res, next) => {
  res.json({
    'nowish': pubserv.history.nowish
  });
});

app.put('/register', (req, res) => {
  const ep = new EndPoint({
    href: (!_.isString(req.body.href) ? url.format(_.extend(req.body.href, { hostname: req.ip })) : req.body.href),
    verb: req.body.verb
  });

  pubserv.registerEndPoint(ep, err => {
    if (!!err) {
      res.status(403).json({
        success: false,
        error: err
      });
    } else {
      w.debug(`app.js: Registered ${ep.toString()}`);

      res.json({
        success: true,
        info: infoJson()
      });
    }
  });
});

app.delete('/register', (req, res) => {
  const ep = new EndPoint({
    href: (!_.isString(req.body.href) ? url.format(_.extend(req.body.href, { hostname: req.ip })) : req.body.href),
    verb: req.body.verb
  });

  pubserv.unregisterEndPoint(ep, err => {
    if (!!err) {
      res.status(403).json({
        success: false,
        error: err
      });
    } else {
      w.debug(`app.js: Unregistered ${ep.toString()}`);
      res.json({
        success: true,
        info: infoJson()
      });
    }
  });
});

app.get('/serv/:command', (req, res, next) => {
  let token = req.query.token;
  if (token !== cfg.secret) {
    res.status(403).json({
      success: false,
      err: new Error('Rejected token')
    });
  } else {
    switch (req.params.command) {
      case 'start': {
        pubserv.start(err => {
          if (!!err) {
            w.warn(err.toString());
            res.status(403).json({ success: false });
          } else {
            w.debug('app.js: Started publishing server.');
            res.json({
              success: true,
              info: infoJson()
            });

          }

        });
      } break;

      case 'stop': {
        pubserv.stop(err => {
          if (!!err) {
            w.warn(err.toString());
            res.status(403).json({ success: false });
          } else {
            w.debug('app.js: Stopped publishing server.');
            res.json({
              success: true,
              info: infoJson()
            });

          }
        });
      } break;

      case 'reset': {
        let reset_date = undefined;
        if (_.isString(req.query.date) && req.query.date.length !== 0) {
          reset_date = moment(req.query.date, 'YYYY-MM-DD[T]hh:mm:ss');
        }

        pubserv.reset(reset_date, err => {
          if (!!err) {
            w.warn(err.toString());
            res.status(403).json({ success: false });
          } else {
            w.debug('app.js: Reset publishing server.');
            res.json({
              success: true,
              info: infoJson()
            });
          }
        });
      } break;

      default:
        res.status(404).send({path: 'Unknown command'});
    }
  }
});


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.json({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: {}
  });
});

module.exports = app;
