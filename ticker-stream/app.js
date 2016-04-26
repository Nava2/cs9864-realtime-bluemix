'use strict';

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
const compression = require('compression');

const url = require('url');
const util = require('util');

const _ = require('lodash');
const w = require('winston');
const request = require('request');

const config = require('./config');

const remoteHref = config.isLocal ? {
  protocol: "http:",
  hostname: config.locals.client.hostname,
  port: config.port,
  pathname: config.locals.client.pathname
} : _.extend(url.parse(config.url), { protocol: "http:", pathname: config.locals.client.pathname });

var index = require('./routes/index')(w);
var api = require('./routes/api')(w);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('combined', {
  skip: function (req, res) { return res.statusCode < 400 }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression());

app.use('/', index);
app.use('/api', api);

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
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.listen(config.port, () => {
  w.info("express started!");
  const uri = config.getServiceURL("stock-data-handler") + 'register';

  w.info("Registering with %s", uri);

  request.put({
    url: uri,
    json: {
      href: remoteHref,
      verb: config.locals.client.verb,
      tickers: []
    }
  }, (err, res) => {

    const body = res.body;
    if (!!body.success) {

      w.info("Registered with stock service!");

      request.put({
        uri: config.getServiceURL('service-registry') + 'add',
        qs: {
          name: config.name,
          url: config.url
        }
      }, (err, resp) => {
        if (!!err) {
          w.error("Could not register with service registry");
          throw err;
        }

        if (resp.statusCode !== 200) {
          let msg = `Invalid status code on registration, ${resp.statusCode}`;
          w.error(msg);
          throw new Error(msg);
        }

        w.info("Registered with service-registry!");
      });
    }
  });

});
module.exports = app;
