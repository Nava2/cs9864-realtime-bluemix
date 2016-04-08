'use strict';

const url = require('url');

const express = require('express');
const path = require('path');
const logger = require('morgan');
const bodyParser = require('body-parser');

const _ = require('lodash');
const w = require('winston');
const moment = require('moment');

const config = require('./config.json');

const app = express();

if (app.get('env') === 'development') {
  w.level = 'debug';
}

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const lib = require('./stock-client')(w);

const client = new lib.StockClient({
  app: app,
  local: {
    href: config.local.href
  },
  remote: {
    href: config.remote.href,
    secret: config.remote.secret
  },
  handlers: {
    data: (data) => {
      data.payload((err, payload) => {
        const rows = _.reduce(payload, (len, arr) => {
          return len + arr.length
        }, 0);
        w.debug('%s: Received %d rows from %d tickers.', data.when, rows, data.tickers.size);
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
    client.restart(err => {
      if (!!err) throw err;
      // started?
      w.info("Restarted server!");
    });

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

