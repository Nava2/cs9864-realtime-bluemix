'use strict'
const _ = require('lodash');
const moment = require('moment');

const Cloudant = require('cloudant');

const cloudant_cred = require('./cloudant.json').credentials;
const service_add= require('./config.json').addresses;


// This application uses express as its web server
// for more info, see: http://expressjs.com
let express = require('express');

let request=require('request');

let restler=require('restler');

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
let stockdatacollection = cloudant_cred.collectionname2;

let stocknewscollection = cloudant_cred.collectionname3;
const stockname="stockname";
const guid="guid";

//Get the Data service address
const yahoo=service_add.yahoorss;

getcollection(stocknewscollection);
listIndexes(stocknewscollection);
createidindexfields(stocknewscollection,guid);
createstockindexfields(stocknewscollection,stockname);


function getcollection(collectionname) {
    restler.put(cloudant_cred.host + '/' + collectionname, {
        username: cloudant_cred.user,
        password: cloudant_cred.password
    }).on('complete', function (data) {
        console.log(data);
    });
}

// List all the indexes of a specific collection
function listIndexes(collectionname) {
    let db = cloudant.use(collectionname);
    db.index(function (er, result) {
        if(!!er) {
            throw er;
        }
        for (let i = 0; i < result.indexes.length; i++) {
            let tmp = result.indexes[i].def['fields'][0];
            for (let k in tmp) {
                console.log('the indexed field: ' + k)
            }
            console.log('The detail of the index for database %s: %s (%s): %j',collectionname, result.indexes[i].name,
                result.indexes[i].type, result.indexes[i].def);
        }
    });
}

function createidindexfields(dataSource,indexname) {
    let db = cloudant.use(dataSource);
    let flag = false;
    let indexarr = [];
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        // search all the indexes existed.
        console.log('The database has %d indexes', result.indexes.length);
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
                console.log('Index creation result: %s', response.result);
            });
        }
    });
}

// Prepare the index for query for a specific collection
function createstockindexfields(dataSource,indexname) {
    let db = cloudant.use(dataSource);
    let flag = false;
    let indexarr = [];
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        // search all the indexes existed.
        console.log('The database has %d indexes', result.indexes.length);
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
                console.log('Index creation result: %s', response.result);
            });
        }
    });
}
//get the stock Data from the stock database.
// Pass in stock and callback function
function getUserDate (st,id,callback) {
    console.log("getUserDate");
    let db = cloudant.use(stocknewscollection);
  if (db) {
    // lets see if we already have an entry for this stock
      let query = {};
    query["guid"] = id;
      query["stockname"]=st;

    db.find({selector:{"guid":id,"stockname":st}}, function (er, result) {
      if (!!er) {
        throw er;
      }
      if(result.docs.length==0){
        console.log("User hasn't visited for this stock before");
        callback(-1);
      }else {
          console.log(JSON.stringify(result.docs[0]));
          callback(result.docs[0].datetime);
      }
    });
  }else{
    console.log("No database connection");
    res.json({"error": "Unable to connect to the stock database"});
  }
  }


function updateUser(hostid,st,time){
console.log("in update user");
    let db = cloudant.use(stocknewscollection);
    if (db) {

        // lets see if we already have an entry for this stock
        let query={};
        query["guid"]=hostid;
        query["stockname"]=st
        db.find({selector:query}, function(er, result) {
            if(!!er) {
                throw er;
            }
            if(result.docs.length==1){

                //exists, lets update
                result.docs[0].datetime=time;
                db.insert( result.docs[0],  result.docs[0]._id, function(err, doc) {
                    if(err) {
                         console.log('Error Updating data\n'+err);
                        return 500;
                    }
                    console.log('Success Updating\n');
                    return 200;
                });


            }else{
                let resp={"guid":hostid, "datetime":time,"stockname":st};
                db.insert(resp, function(err, doc) {
                    if(err) {
                         console.log('Error inserting data\n'+err);
                        return 500;
                    }
                    console.log('Success Inserting\n');
                    return 200;
                });
            }
        });
    }else{
        console.log('db is not running');
    }

}

function getData (str,callback) {

    let db = cloudant.use(stockdatacollection);
    if (db) {
        // lets see if we already have an entry for this stock
        let query = {};
        query["stockname"] = str;
        db.find({selector: query}, function (er, result) {
            if (!!er) {
                throw er;

            }
            if(result.docs.length==0){
                console.log("No data for the specified stock");
                callback(null);
            }
            else {
                callback(result.docs[0]);
            }
        });
    }else{
        console.log("No database connection");
        res.json({"error": "Unable to connect to the stock database"});
    }
}

//get the news Data from the stock database.
// Pass in stock and callback function
function getNews(str, callback){

    let a = yahoo+"/getData?stockname="+str;
  //console.log(a);

  request(a, function (error, response, body) {
    if (!error && response.statusCode == 200) {
        callback(body);
    }
      else{
        callback({"error":"Incorrect news data"});
    }
  });
}

///Example : http://localhost:6003/getDataSync?stockname=AAPL
app.get('/getData', function (req, res) {

    //Grab the stock argument
    let stock = req.query.stockname.toUpperCase();

    getData(stock, function (data) {

        if(data==null){
            res.json({"error":"Error getting stock data"});

        }else {
            let stockData = data;
            //console.log(stockData);
            delete stockData._id;
            delete stockData._rev;
            let dat= moment(data.datetime, "YYYY-MM-DDTHH:mm:ss");
            delete stockData.datetime;
            stockData = {"stock": stockData};
            getNews(stock, function (data) {
                if (data == null) {
                    res.json({"error": "Error getting news data"});

                } else {
                    let temp=[];
                    _.each(JSON.parse(data), function (arr, key) {
                        let dat2 = moment(arr.date, "YYYY-MM-DDTHH:mm:ss");


                        if(dat.hours() == dat2.hours() && dat.minutes() == dat2.minutes()){
                            let news = {"title": arr.title, "link": arr.link};

                            temp.push(news);


                        }
                        else{
                            //var news = {};

                            //temp.push(news);

                        }
                    });
                    let b= "news";
                    let re={};
                    re[b]=temp;
                    let combined = _.extend(stockData, re);
                    let a = {"time": dat, "data": combined};
                    res.json(a);

                }
            });
        }});

});

///Example : http://localhost:6005/getDataSince?stockname=AAPL&guid=123
app.get('/getDataSince', function (req, res) {

    //Grab the stock argument
    let stock = req.query.stockname.toUpperCase();
    let id = req.query.guid;
    console.log("stock: "+stock+" id:"+id);


    getData(stock, function (data) {

        console.log(data);
        if(data==null){
            console.log("IN UNDEFINED")
            let a={"error":"Error getting stock data"};
            res.json(a);
        }else{
            let stockData = data;
           // console.log("old stockdata: "+stockData);
            delete stockData._id;
            delete stockData._rev;
            //let dat=new moment(data.datetime);
            let dat= moment(data.datetime, "YYYY-MM-DDTHH:mm:ss");
            console.log(moment(dat));
            //let dat = new Date(Date.parse(data.datetime));
            delete stockData.datetime;
            stockData = {"stock": stockData};
            let finresult={};
            getNews(stock, function (data) {
                let newsres=data;
               // console.log("news data: "+newsres);
                if (data == null){
                    res.json({"error": "Error getting news data"});

                }else{
                    getUserDate(stock,id, function (data)
                    {
                        //let f=new Date(Date.parse(data));
                        //let f = new moment(data);
                        //console.log("parseUser: "+f.getUTCHours());
                        console.log("parseUser: "+moment(data).hours());
                        if(data==-1) {
                            let temp = [];

                            let datatime;
                            if(dat.minutes()<10) {
                                datatime = dat.hours()+5 + ":0" + dat.minutes() + ":00";
                            }else{
                                datatime = dat.hours()+5 + ":" + dat.minutes() + ":00";
                            }
                            console.log("datatime"+datatime);



                            _.each(JSON.parse(newsres), function (arr, key) {

                                //let dat2 = new Date(Date.parse(arr.date));
                                let dat2 = moment(arr.date, "YYYY-MM-DDTHH:mm:ss");

                                let newstime;
                                if(dat2.minutes()<10) {
                                    newstime = dat2.hours() + ":0" + dat2.minutes() + ":00";
                                }else{
                                    newstime = dat2.hours() + ":" + dat2.minutes() + ":00";
                                }
                                console.log("newstime"+newstime);

                                let min1 = moment(datatime, "hh:mm:ss").diff(moment(newstime, "hh:mm:ss"),'minutes');
                                
                                if ((min1>=0)) {
                                    let news = {"title": arr.title, "link": arr.link};
                                    temp.push(news);


                                }
                                else {
                                    //var news = {news: {}};
                                    //temp.push(news);

                                }

                            });
                            let x={};
                            let n="news";
                            x[n]=temp;
                            let combined = _.extend(stockData, x);


                            // let t2=new Date();
                            // t2.setHours(dat.getUTCHours());
                            // t2.setMinutes(dat.getUTCMinutes());

                           let t2 = new moment(dat);
                            finresult = {"time": t2, "data": combined};

                            updateUser(id,stock,t2);
                            //res.json(temp);
                        }
                        else{
                            //let dat3=new Date(Date.parse(data));
                            let dat3=moment(data, "YYYY-MM-DDTHH:mm:ss");
                            console.log("HERE: "+data);
                            //console.log("dat3:"+moment(dat3).utc.hours());
                            let temp = [];

                            let datatime;
                            if(dat.minutes()<10) {
                                datatime = dat.hours()+5 + ":0" + dat.minutes() + ":00";
                            }else{
                                datatime = dat.hours()+5 + ":" + dat.minutes() + ":00";
                            }
                            console.log("datatime"+datatime);

                            let usertime;
                            if(dat3.minutes()<10) {
                                usertime = dat3.hours() + ":0" + dat3.minutes() + ":00";
                            }else{
                                usertime = dat3.hours() + ":" + dat3.minutes() + ":00";
                            }
                            console.log("usertime"+usertime);

                            _.each(JSON.parse(newsres), function (arr, key) {
                                //let dat2 = new Date(Date.parse(arr.date));
                                let dat2 = moment(arr.date, "YYYY-MM-DDTHH:mm:ss");

                                let newstime;
                                if(dat2.minutes()<10) {
                                    newstime = dat2.hours() + ":0" + dat2.minutes() + ":00";
                                }else{
                                    newstime = dat2.hours() + ":" + dat2.minutes() + ":00";
                                }
                                console.log("newstime"+newstime);

                                let min1 = moment(datatime, "HH:mm:ss").diff(moment(newstime, "HH:mm:ss"),'minutes');
                                let min2 = moment(newstime, "HH:mm:ss").diff(moment(usertime, "HH:mm:ss"),'minutes');
                                console.log("min1 "+min1+" min2:"+min2);
                                if ((min1>=0)&&(min2>=0)) {

                                    let news = {"title": arr.title, "link": arr.link};
                                    temp.push(news);
                                }
                                else {
                                    //var news = {};
                                    //temp.push(news);

                                }

                            });
                            let x={};
                            let n="news";
                            x[n]=temp;
                            let combined = _.extend(stockData, x);


                            // let t=new Date();
                            // t.setHours(dat.getUTCHours());
                            // t.setMinutes(dat.getUTCMinutes());
                            // let t2=new Moment();
                            // t2.hours(dat.utc.hours()+5);
                            // t2.minutes(dat.utc.minutes());
                            let t2 = new moment(dat);
                            //finresult = {"time": t2, "data": combined};
                            finresult = {"time": t2, "data": combined};
                            updateUser(id,stock,t2);

                        }
                        res.json(finresult);
                    });


                }

            });
        }});

});


// start server on the specified port and binding host
app.listen(appEnv.port, function () {

  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});