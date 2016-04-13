// const dgram = require('dgram');
// const server = dgram.createSocket('udp4');
//
// // server.on('error', (err) => {
// //   console.log(`server error:\n${err.stack}`);
// //   server.close();
// // });
//
// server.on('message', (msg, rinfo) => {
//   console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
// });
//
// // server.on('listening', () => {
// //   var address = server.address();
// //   console.log(`server listening ${address.address}:${address.port}`);
// // });
//
// server.bind(41234);
// // server listening 0.0.0.0:41234
// // server.bind({
// //   address: 'localhost',
// //   port: 41234,
// //   exclusive: true
// // });

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
app.use(bodyParser.urlencoded({extended: false}));
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
                w.debug('%s: Received %d rows from %d tickers.', data.when, data.payload.length, data.tickers.size);
            }
        }
    })
    ;

let server = app.listen(4000, () => {
        w.info("express started!");

        client.connect(err => {
            if (!!err
            )
                throw err;

            w.info("Connected!");

            client.restart(err => {
                if (
                    !!err
                )
                    throw err;
// started?
                w.info("Restarted server!");
            })
            ;

// Wait 15s then close the connection
            setTimeout(() => {
                    w.info("Disconnecting!");

                    client.disconnect(err => {
                        if (
                            !!err)
                            throw err;

                        w.info("Disconnected!");

                        server.close();
                    })
                    ;

                },
                15000
            )
            ;

        })
        ;
    })
    ;