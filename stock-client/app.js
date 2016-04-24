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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(logger('combined', {
  skip: function (req, res) { return res.statusCode < 400 }
}));

const EP = require('./lib/endpoint-manager')(w);
const lib = require('./lib/stock-client')(w);

const register = require('./routes/register')(w);

app.use(register);

const mgr =  new EP.Manager({
  cloudantUrl: config.getServiceURL(/^Cloudant NoSQL DB.*/),
  "refresh-rate": config.locals.database["refresh-rate"],
  database: config.locals.database.name
});
app.locals.mgr = mgr;

const client = new lib.StockClient({
  app: app,
  config: config,
  handlers: {
    data: (data) => {
      const eps = mgr.endPointsFor(data.tickers);

      if (eps.length > 0) {
        w.silly("Sending data to %d endpoints!", eps.length);
        // only decode if necessary
        data.payload((err, payload) => {

          eps.forEach(e => {
            const validTickers = _.intersection(e.tickers, data.tickers);

            if (validTickers.length > 0) {
              const payloadToSend = _.pick(payload, validTickers.map(_.upperCase));
              const rowCount = _.reduce(_.map(payloadToSend, v => (v.length)), (s, v) => (s + v));
              w.silly("Sending %d rows from %d tickers to %s", rowCount, _.keys(payloadToSend).length, e.ep.toString());
              
              e.ep.send({
                path: '',
                data: {
                  when: data.when.format('YYYY-MM-DDThh:mm:ss'),
                  tickers: validTickers,
                  payload: payloadToSend
                },
                next: err => {
                  if (!!err) {
                    mgr.removeEndpoint(e.ep, () => {
                      w.warn(`Removing: Failed to send: ${err} {${e.ep.toString()}}`);
                    });
                  } else {
                    w.debug(`sent data to ${e.ep.toString()}`);
                  }
                }
              });
            }
          });
        });
      }


    }
  }
});
app.locals.stockClient = client;

app.listen(config.port, () => {
  w.info("express started!");

  mgr.init(err => {
    if (!!err) throw err;
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

