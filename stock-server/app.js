'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const routes = require('./routes/index');
const w = require('winston');
const _ = require('lodash');
const sqlite3 = require('sqlite3');
const moment = require('moment');

const cfg = require('./config.json');
const inetAddresses = require('interface-addresses')();
cfg.inetAddress = inetAddresses[cfg.interface];


const app = express();


if (app.get('env') === 'development') {
  w.level = 'debug';
}

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const publish = require('./publish')(w);

const pubserv = new publish.Service(cfg);

const isDaemon = false;

function infoJson() {
  let info = {
    'port': cfg.port,
    'address': cfg.inetAddress
  };

  if (!isDaemon) {
    return _.extend(info, {
      exchange: pubserv.exchange,
      'nowish': pubserv.history.nowish,
      'state': pubserv.state
    });
  } else {
    throw new Error('unimplemented *shrug*');
  }
}

app.get('/info', (req, res, next) => {
  res.json(infoJson());
});

app.get('/now', (req, res, next) => {
  res.json({
    'nowish': pubserv.history.nowish
  });
});

app.put('/register', (req, res, next) => {
  let port = _.toNumber(req.query.port);

  if (!!port) {
    res.status(403).json({
      success: false,
      error: 'Must specify numeric port parameter.'
    });
  } else {
    pubserv.registerEndPoint(req.ip, port, err => {
      if (!!err) {
        res.status(403).json({
          success: false,
          error: err
        });
      }

      res.json({
        success: true,
        info: infoJson()
      });
    });
  }
});

app.delete('/register', (req, res, next) => {
  let port = _.toNumber(req.query.port);

  let nnext = err => {
    if (!!err) {
      res.status(403).json({
        success: false,
        error: err
      });
    }

    res.json({
      success: true,
      info: infoJson()
    });
  };

  if (!!port) {
    pubserv.unregisterEndPoint(req.ip, nnext);
  } else {
    pubserv.unregisterEndPoint(req.ip, port, nnext);
  }
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
        pubserv.start(() => {
          res.json({
            success: true,
            info: infoJson()
          });
        });
      } break;

      case 'stop': {
        pubserv.stop(() => {
          res.json({
            success: true,
            info: infoJson()
          });
        });
      } break;

      case 'reset': {
        let reset_date = undefined;
        if (_.isString(req.query.date)) {
          reset_date = moment(req.query.date, 'YYYY-MM-DD[T]hh:mm:ss');
        }

        pubserv.reset(reset_date, () => {
          res.json({
            success: true,
            info: infoJson()
          });
        });
      } break;

      default:
        res.status(404).send('Unknown command');
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
