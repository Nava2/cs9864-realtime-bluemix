'use strict'
const _ = require('lodash');
const moment = require('moment');

const Cloudant = require('cloudant');

const cloudant_cred = require('./cloudant.json').credentials;
const service_add = require('./address.json').addresses;

//Setting up logger
const w = require('winston');

const url = require('url');
// This application uses express as its web server
// for more info, see: http://expressjs.com
const express = require('express');

const request = require('request');

const restler = require('restler');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
let cfenv = require('cfenv');


// create a new express server
let app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// get the app environment from Cloud Foundry
let appEnv = cfenv.getAppEnv();

// Get the database from the config. object
const cloudant = Cloudant(cloudant_cred.url);
const stock_data_collection = cloudant_cred.collectionname2;

const stock_news_collection = cloudant_cred.collectionname3;
const stockname = "stockname";
const guid = "guid";

//Get the Data service address
const yahoo = service_add.yahoorss;

getCollection(stock_data_collection);
listIndexes(stock_news_collection);
createIdIndexFields(stock_news_collection, guid);
createStockIndexFields(stock_news_collection, stockname);


function getCollection(collectionname) {
    restler.put(cloudant_cred.host + '/' + collectionname, {
        username: cloudant_cred.user,
        password: cloudant_cred.password
    }).on('complete', function (data) {
        w.info(data);
    });
}

// List all the indexes of a specific collection
function listIndexes(collectionname) {
    let db = cloudant.use(collectionname);
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        for (let i = 0; i < result.indexes.length; i++) {
            let tmp = result.indexes[i].def['fields'][0];
            for (let k in tmp) {
                w.info('the indexed field: ' + k)
            }
            //w.info('The detail of the index for database %s: %s (%s): %j', collectionname, result.indexes[i].name,
            //result.indexes[i].type, result.indexes[i].def);
        }
    });
}

function createIdIndexFields(dataSource, indexname) {
    let db = cloudant.use(dataSource);
    let flag = false;
    let indexarr = [];
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        // search all the indexes existed.
        //w.info('The database has %d indexes', result.indexes.length);
        for (let i = 0; i < result.indexes.length; i++) {
            let tmp = result.indexes[i].def['fields'][0];
            for (let k in tmp) {
                indexarr.push(k);
            }
        }

        //create index for the service name field if it does not exist.
        if (indexarr.indexOf(indexname) == -1) {
            let nameindex = {name: 'guid_index', type: 'json', index: {fields: ['guid']}}
            db.index(nameindex, function (er, response) {
                if (!!er) {
                    throw er;
                }
                // w.info('Index creation result: %s', response.result);
            });
        }
    });
}

// Prepare the index for query for a specific collection
function createStockIndexFields(dataSource, indexname) {
    let db = cloudant.use(dataSource);
    let flag = false;
    let indexarr = [];
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        // search all the indexes existed.
        // w.info('The database has %d indexes', result.indexes.length);
        for (let i = 0; i < result.indexes.length; i++) {
            let tmp = result.indexes[i].def['fields'][0];
            for (let k in tmp) {
                indexarr.push(k);
            }
        }

        //create index for the service name field if it does not exist.
        if (indexarr.indexOf(indexname) == -1) {
            let nameindex = {name: 'stock_index', type: 'json', index: {fields: ['stockname']}}
            db.index(nameindex, function (er, response) {
                if (!!er) {
                    throw er;
                }
                //w.info('Index creation result: %s', response.result);
            });
        }
    });
}

//get the stock Data from the stock database.
// Pass in stock and callback function
function getUserDate(stock, usrid, callback) {
    w.info("getUserDate");
    let db = cloudant.use(stock_news_collection);
    if (!!db) {
        // Keeping this commented temporarily until it can be tested
        //   let query = {};
        //   query["guid"] = usrid;
        //   query["stockname"]=stock;

        db.find({selector: {"guid": usrid, "stockname": stock}}, function (er, result) {
            if (!!er) {
                callback(0);
            }
            if (result.docs.length == 0) {
                w.info("User hasn't visited for this stock before");
                callback(-1);
            } else {
                //w.info(JSON.stringify(result.docs[0]));
                callback(result.docs[0].datetime);
            }
        });
    } else {
        w.info("No database connection");
        res.json({"error": "Unable to connect to the stock database"});
    }
}


function updateUser(hostid, st, time) {
    w.info("in update user");
    let db = cloudant.use(stock_news_collection);
    if (!!db) {

        // lets see if we already have an entry for this stock
        let query = {};
        query["guid"] = hostid;
        query["stockname"] = st
        db.find({selector: query}, function (er, result) {
            if (!!er) {
                w.info('Error getting the user');
            }
            if (result.docs.length == 1) {

                //exists, lets update
                result.docs[0].datetime = time;
                db.insert(result.docs[0], result.docs[0]._id, function (err, doc) {
                    if (err) {
                        w.info('Error Updating data\n' + err);

                    }
                    w.info('Success Updating\n');

                });


            } else {
                let resp = {"guid": hostid, "datetime": time, "stockname": st};
                db.insert(resp, function (err, doc) {
                    if (err) {
                        w.info('Error inserting data\n' + err);

                    }
                    w.info('Success Inserting\n');

                });
            }
        });
    } else {
        w.info('db is not running');
    }

}

function getData(str, callback) {

    let db = cloudant.use(stock_data_collection);
    if (!!db) {
        // lets see if we already have an entry for this stock
        let query = {stockname: str};
        // query["stockname"] = str;
        db.find({selector: query}, function (er, result) {
            if (!!er) {
                throw er;

            }
            if (result.docs.length == 0) {
                w.info("No data for the specified stock");
                callback(null);
            }
            else {
                callback(result.docs[0]);
            }
        });
    } else {
        w.info("No database connection");
        res.json({"error": "Unable to connect to the stock database"});
    }
}

//get the news Data from the stock database.
// Pass in stock and callback function
function getNews(str, callback) {


    let yahooNews = url.format(_.extend(url.parse(yahoo), {
        pathname: "/getData",
        query: {
            stockname: str
        }
    }));


    request(yahooNews, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            callback(body);
        }
        else {
            callback({"error": "Incorrect news data"});
        }
    });
}

///Example : http://localhost:6003/getDataSync?stockname=AAPL
app.get('/getData', (req, res)=> {

    //Grab the stock argument
    if (!_.isString(req.query.stockname)) {
        res.status(400).json({"error": "Need to pass stockname parameter"});

    } else {
        let stock = req.query.stockname.toUpperCase();

        getData(stock, function (data) {

            if (!data) {
                res.status(503).json({"error": "Error getting stock data"});

            } else {
                let stockData = data;

                delete stockData._id;
                delete stockData._rev;
                let dataDate = moment(data.datetime, "YYYY-MM-DDTHH:mm:ss");

                delete stockData.datetime;
                stockData = {"stock": stockData};
                getNews(stock, function (data) {
                    if (!data) {
                        res.json({"error": "Error getting news data"});

                    } else {
                        let temp = [];
                        _.each(JSON.parse(data), function (arr, key) {
                            let newsDate = moment(arr.date, "YYYY-MM-DDTHH:mm:ss");
                            console.log("newtime:" + newsDate.hours() + ":" + newsDate.minutes());
                            console.log("stocktime:" + dataDate.hours() + ":" + dataDate.minutes());
                            if (dataDate.hours() == newsDate.hours() && dataDate.minutes() == newsDate.minutes()) {
                                let news = {"title": arr.title, "link": arr.link};

                                temp.push(news);


                            }
                        });
                        // let news = "news";
                        // let result = {};
                        // result[news] = temp;
                        // let combined = _.extend(stockData, result);
                        // let finalResult = {"time": dat, "data": combined};
                        let finalResult = {
                            time: dataDate,
                            data: _.extend(stockData, {news: temp})
                        }
                        res.json(finalResult);

                    }
                });
            }
        });
    }
});

///Example : http://localhost:6005/getDataSince?stockname=AAPL&guid=123
app.get('/getDataSince', function (req, res) {


    if (!_.isString(req.query.stockname) || !_.isString(req.query.guid)) {
        res.status(400).json({"error": "Need to pass correct parameters"});

    } else {
        //Grab the stock argument
        let stock = req.query.stockname.toUpperCase();
        let id = req.query.guid;
        getData(stock, function (data) {


            if (!data) {
                res.status(503).json({"error": "Error getting stock data"});
            } else {
                let stockData = data;

                delete stockData._id;
                delete stockData._rev;

                let dataDate = moment(data.datetime, "YYYY-MM-DDTHH:mm:ss");


                delete stockData.datetime;
                stockData = {"stock": stockData};
                let finresult = {};
                getNews(stock, function (data) {
                    let newsres = data;
                    if (!data) {
                        res.json({"error": "Error getting news data"});

                    } else {
                        getUserDate(stock, id, function (data) {
                            if (data == 0) {
                                res.json({"error": "Error getting user date"});
                            } else {

                                if (data == -1) {
                                    let temp = [];

                                    let datatime;
                                    if (dataDate.minutes() < 10) {
                                        datatime = dataDate.hours() + 5 + ":0" + dataDate.minutes() + ":00";
                                    } else {
                                        datatime = dataDate.hours() + 5 + ":" + dataDate.minutes() + ":00";
                                    }

                                    _.each(JSON.parse(newsres), function (arr, key) {
                                        let newsDate = moment(arr.date, "YYYY-MM-DDTHH:mm:ss");

                                        let newstime;
                                        if (newsDate.minutes() < 10) {
                                            newstime = newsDate.hours() + ":0" + newsDate.minutes() + ":00";
                                        } else {
                                            newstime = newsDate.hours() + ":" + newsDate.minutes() + ":00";
                                        }

                                        let min1 = moment(datatime, "hh:mm:ss").diff(moment(newstime, "hh:mm:ss"), 'minutes');

                                        if ((min1 >= 0)) {
                                            let news = {"title": arr.title, "link": arr.link};
                                            temp.push(news);


                                        }

                                    });


                                    finresult = {
                                        time: dataDate,
                                        data: _.extend(stockData, {news: temp})
                                    }
                                    ;

                                    updateUser(id, stock, dataDate);
                                    //res.json(temp);
                                }
                                else {
                                    //let dat3=new Date(Date.parse(data));
                                    let userDate = moment(data, "YYYY-MM-DDTHH:mm:ss");
                                    let temp = [];

                                    let datatime;
                                    if (dataDate.minutes() < 10) {
                                        datatime = dataDate.hours() + 5 + ":0" + dataDate.minutes() + ":00";
                                    } else {
                                        datatime = dataDate.hours() + 5 + ":" + dataDate.minutes() + ":00";
                                    }

                                    let usertime;
                                    if (userDate.minutes() < 10) {
                                        usertime = userDate.hours() + ":0" + userDate.minutes() + ":00";
                                    } else {
                                        usertime = userDate.hours() + ":" + userDate.minutes() + ":00";
                                    }

                                    _.each(JSON.parse(newsres), function (arr, key) {
                                        //let dat2 = new Date(Date.parse(arr.date));
                                        let newsDate = moment(arr.date, "YYYY-MM-DDTHH:mm:ss");

                                        let newstime;
                                        if (newsDate.minutes() < 10) {
                                            newstime = newsDate.hours() + ":0" + newsDate.minutes() + ":00";
                                        } else {
                                            newstime = newsDate.hours() + ":" + newsDate.minutes() + ":00";
                                        }

                                        let min1 = moment(datatime, "HH:mm:ss").diff(moment(newstime, "HH:mm:ss"), 'minutes');
                                        let min2 = moment(newstime, "HH:mm:ss").diff(moment(usertime, "HH:mm:ss"), 'minutes');
                                        if ((min1 >= 0) && (min2 >= 0)) {

                                            let news = {"title": arr.title, "link": arr.link};
                                            temp.push(news);
                                        }

                                    });

                                    finresult = {
                                        time: dataDate,
                                        data: _.extend(stockData, {news: temp})
                                    };

                                    updateUser(id, stock, dataDate);

                                }
                                res.json(finresult);
                            }
                        });


                    }

                });
            }
        });
    }
});


// start server on the specified port and binding host
app.listen(appEnv.port, function () {

    // print a message when the server starts listening
    w.info("server starting on " + appEnv.url);
});
