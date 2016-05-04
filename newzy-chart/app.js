'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const request = require('request');
const w = require('winston');

const config = require('blue-config')(path.join(__dirname, 'config'));

const routes = require('./routes/index');
const api = require('./routes/api')(w);

const app = express();

w.level = 'silly';

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('combined', {
  // skip: function (req, res) { return res.statusCode < 400 }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'bower_components')));

app.use('/', routes);
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
  w.info("express started! port = %d", config.port);


  request.post({
    uri: config.getServiceURL('service-registry') + 'api/add',
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

    w.info("Registered with service-registry.");
  });

});

