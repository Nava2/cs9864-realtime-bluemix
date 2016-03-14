'use strict';

const express = require('express');
const router = express.Router();

const _ = require('lodash');


module.exports = (cloudant) => {


    /* GET home page. */
    router.get('/', function(req, res, next) {

        let ticker = !!req.query.ticker ? req.query.ticker : 'aapl';

        let db = cloudant.db.use('stock-data-test');

        db.find({
            selector: {
                date: 20110113,
                ticker: req.query.ticker 
            }
        }, (err, result) => {

            let rows = result.docs.map(r => {

                return r.transactions.slice(0, 100).map(t => ({
                    date: r.date,
                    ticker: r.ticker,
                    time: t.time,
                    price: t.price
                }));

            });

            res.render('index', { 
                title: _.toUpper(req.query.ticker),
                data: _.flatten(rows)
            });
        });

        

    });

    return router;
};
