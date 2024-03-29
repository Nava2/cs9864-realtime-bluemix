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

//var index = require('./routes/index')(w);
var api = require('./routes/api')(w);

var app = express();


app.use(logger('combined', {
  skip: function (req, res) { return res.statusCode < 400 }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression());

//app.use('/', index);
app.use('/api', api);

// catch 404 and forward to error handler
// app.use(function(req, res, next) {
//   var err = new Error('Not Found');
//   err.status = 404;
//   next(err);
// });

// error handlers

// development error handler
// will print stacktrace
// if (app.get('env') === 'development') {
//   app.use(function(err, req, res, next) {
//     res.status(err.status || 500);
//     res.render('error', {
//       message: err.message,
//       error: err
//     });
//   });
// }

// production error handler
// no stacktraces leaked to user
// app.use(function(err, req, res, next) {
//   res.status(err.status || 500);
//   res.render('error', {
//     message: err.message,
//     error: {}
//   });
// });

app.listen(config.port, () => {
  w.info("express started!");
  const uri = config.getServiceURL("stock-client") + 'register';

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
    


    }
  });

});

