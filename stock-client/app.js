'use strict';

const url = require('url');
const util = require('util');

const _ = require('lodash');

const express = require('express');
const path = require('path');
const logger = require('morgan');
const bodyParser = require('body-parser');

const w = require('winston');
const moment = require('moment');

const config = require('./config');

const app = express();

if (app.get('env') === 'development') {
  w.level = 'debug';
}

w.info("Configuration: %s", util.inspect(config, { depth: null, colors: true }));

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(logger('dev'));

const EP = require('./lib/endpoint-manager')(w);
const lib = require('./lib/stock-client')(w);

const register = require('./routes/register')(w);

app.use(register);

const mgr =  new EP.Manager(config.cloudant);
app.locals.mgr = mgr;

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
        const eps = mgr.endPointsFor(data.tickers);

        const onErr = err => {
          if (!!err) {
            throw err;
          }
        };

        eps.forEach(e => {
          const validTickers = _.intersection([e.tickers, data.tickers]);

          e.ep.send({
            path: '/',
            data: {
              when: data.when.format('YYYY-MM-DDThh:mm:ss'),
              tickers: validTickers,
              payload: _.pick(payload, validTickers)
            },
            next: onErr
          });
        });
      });

    }
  }
});
app.locals.stockClient = client;

app.listen(process.env.VCAP_APP_PORT || config.local.href.port, () => {
  w.info("express started!");

  mgr.init(err => {

  });

  client.connect(err => {
    if (!!err) throw err;

    w.info("Connected!");

    //Uncomment to restart the server each time!
    client.restart(err => {
      if (!!err) throw err;
      // started?
      w.info("Restarted server!");
    });

    // Wait 15s then close the connection
    // setTimeout(() => {
    //   w.info("Disconnecting!");
    //
    //   client.disconnect(err => {
    //     if (!!err) throw err;
    //
    //     w.info("Disconnected!");
    //
    //     server.close();
    //   });
    //
    // }, 15000);

  });
});

