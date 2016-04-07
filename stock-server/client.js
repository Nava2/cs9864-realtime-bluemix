'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const w = require('winston');
const _ = require('lodash');
const moment = require('moment');

const config = require('./config.json');

const app = express();

if (app.get('env') === 'development') {
  w.level = 'debug';
}

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const lib = require('./stock-client')(w);

const client = new lib.StockClient({
  app: app,
  local: {
    baseRoute: '/client'
  },
  remote: 'http://cs9864-2016.csd.uwo.ca:80/',
  secret: config.secret,
  handlers: {
    data: (data) => {
      data.payload((err, payload) => {
        w.debug('%s: Received %d rows from %d tickers.', data.when, payload.length, data.tickers.size);
      });

    }
  }
});

let server = app.listen(4000, () => {
  w.info("express started!");
  
  client.connect(err => {
    if (!!err) throw err;

    w.info("Connected!");

    // Uncomment to restart the server each time!
    // client.restart(err => {
    //   if (!!err) throw err;
    //   // started?
    //   w.info("Restarted server!");
    // });

    // Wait 15s then close the connection
    setTimeout(() => {
      w.info("Disconnecting!");

      client.disconnect(err => {
        if (!!err) throw err;

        w.info("Disconnected!");

        server.close();
      });

    }, 15000);

  });
});

