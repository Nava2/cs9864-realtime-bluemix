
const _ = require('lodash');
const moment = require('moment');

const Cloudant = require('cloudant');

const cloudant_cred = require('./cloudant.json').credentials;
const service_add= require('./config.json').addresses;


// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

var request=require('request');

var restler=require('restler');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');


// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// Get the database from the config. object
const cloudant = Cloudant(cloudant_cred.url);
var stockdatacollection = cloudant_cred.collectionname2;

var stocknewscollection = cloudant_cred.collectionname3;
const stockname=stockname;
const guid=guid;

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
    var db = cloudant.use(collectionname);
    db.index(function (er, result) {
        if(!!er) {
            throw er;
        }
        for (var i = 0; i < result.indexes.length; i++) {
            var tmp = result.indexes[i].def['fields'][0];
            for (var k in tmp) {
                console.log('the indexed field: ' + k)
            }
            console.log('The detail of the index for database %s: %s (%s): %j',collectionname, result.indexes[i].name,
                result.indexes[i].type, result.indexes[i].def);
        }
    });
}

function createidindexfields(dataSource,indexname) {
    var db = cloudant.use(dataSource);
    var flag = false;
    var indexarr = [];
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        // search all the indexes existed.
        console.log('The database has %d indexes', result.indexes.length);
        for (var i = 0; i < result.indexes.length; i++) {
            var tmp = result.indexes[i].def['fields'][0];
            for (var k in tmp) {
                indexarr.push(k);
            }
        }

        //create index for the service name field if it does not exist.
        if (indexarr.indexOf(indexname) == -1) {
            var nameindex = {name: 'guid_index', type: 'json', index: {fields: ['guid']}}
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
    var db = cloudant.use(dataSource);
    var flag = false;
    var indexarr = [];
    db.index(function (er, result) {
        if (!!er) {
            throw er;
        }
        // search all the indexes existed.
        console.log('The database has %d indexes', result.indexes.length);
        for (var i = 0; i < result.indexes.length; i++) {
            var tmp = result.indexes[i].def['fields'][0];
            for (var k in tmp) {
                indexarr.push(k);
            }
        }

        //create index for the service name field if it does not exist.
        if (indexarr.indexOf(indexname) == -1) {
            var nameindex = {name: 'stock_index', type: 'json', index: {fields: ['stockname']}}
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
  var db = cloudant.use(stocknewscollection);
  if (db) {
    // lets see if we already have an entry for this stock
    var query = {};
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
    var db = cloudant.use(stocknewscollection);
    if (db) {

        // lets see if we already have an entry for this stock
        var query={};
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
                var resp={"guid":hostid, "datetime":time,"stockname":st};
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

    var db = cloudant.use(stockdatacollection);
    if (db) {
        // lets see if we already have an entry for this stock
        var query = {};
        query["stockname"] = str;
        db.find({selector: query}, function (er, result) {
            if (!!er) {
                throw er;
            }
            if(result.docs.length==0){
                console.log("No data for the specified stock");
                callback({"error":"No data for the specified stock"});
            }
            callback(result.docs[0]);
        });
    }else{
        console.log("No database connection");
        res.json({"error": "Unable to connect to the stock database"});
    }
}

//get the news Data from the stock database.
// Pass in stock and callback function
function getNews(str, callback){

  var a = yahoo+"/getData?stockname="+str;
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
    stock = req.query.stockname.toUpperCase();

    getData(stock, function (data) {

        if(data==null){
            res.json({"error":"Error getting stock data"});

        }else {
            stockData = data;
            //console.log(stockData);
            delete stockData._id;
            delete stockData._rev;
            dat = new Date(Date.parse(data.datetime));
            delete stockData.datetime;
            stockData = {"stock": stockData};
            getNews(stock, function (data) {
                if (data == null) {
                    res.json({"error": "Error getting news data"});

                } else {
                    var temp=[];
                    _.each(JSON.parse(data), function (arr, key) {
                        dat2 = new Date(Date.parse(arr.date));


                        if(dat.getUTCHours() == dat2.getHours() && dat.getUTCMinutes() == dat2.getMinutes()){
                            var news = {"title": arr.title, "link": arr.link};

                            temp.push(news);


                        }
                        else{
                            //var news = {};

                            //temp.push(news);

                        }
                    });
                    var b= "news";
                    var re={};
                    re[b]=temp;
                    var combined = _.extend(stockData, re);
                    var a = {"time": dat, "data": combined};
                    res.json(a);

                }
            });
        }});

});

///Example : http://localhost:6005/getDataSince?stockname=AAPL&guid=123
app.get('/getDataSince', function (req, res) {

    //Grab the stock argument
    stock = req.query.stockname.toUpperCase();
    id = req.query.guid;
    console.log("stock: "+stock+" id:"+id);

    getData(stock, function (data) {

        if(data==null){
            res.json({"error":"Error getting stock data"});
            return;
        }else{
            stockData = data;
           // console.log("old stockdata: "+stockData);
            delete stockData._id;
            delete stockData._rev;
            dat = new Date(Date.parse(data.datetime));
            delete stockData.datetime;
            stockData = {"stock": stockData};
            var finresult={};
            getNews(stock, function (data) {
                var newsres=data;
               // console.log("news data: "+newsres);
                if (data == null){
                    res.json({"error": "Error getting news data"});
                    return;
                }else{
                    getUserDate(stock,id, function (data)
                    {
                        var f=new Date(Date.parse(data));

                        console.log("parseUser: "+f.getUTCHours());
                        if(data==-1) {
                            var temp = [];

                            var datatime;
                            if(dat.getUTCMinutes()<10) {
                                datatime = dat.getUTCHours()+5 + ":0" + dat.getUTCMinutes() + ":00";
                            }else{
                                datatime = dat.getUTCHours()+5 + ":" + dat.getUTCMinutes() + ":00";
                            }
                            console.log("datatime"+datatime);



                            _.each(JSON.parse(newsres), function (arr, key) {

                                dat2 = new Date(Date.parse(arr.date));


                                var newstime;
                                if(dat2.getMinutes()<10) {
                                    newstime = dat2.getHours() + ":0" + dat2.getMinutes() + ":00";
                                }else{
                                    newstime = dat2.getHours() + ":" + dat2.getMinutes() + ":00";
                                }
                                console.log("newstime"+newstime);

                                var min1 = moment(datatime, "HH:mm:ss").diff(moment(newstime, "HH:mm:ss"),'minutes');
                                
                                if ((min1>=0)) {
                                    var news = {"title": arr.title, "link": arr.link};
                                    temp.push(news);


                                }
                                else {
                                    //var news = {news: {}};
                                    //temp.push(news);

                                }

                            });
                            var x={};
                            var n="news";
                            x[n]=temp;
                            var combined = _.extend(stockData, x);


                            var t2=new Date();
                            t2.setHours(dat.getUTCHours());
                            t2.setMinutes(dat.getUTCMinutes());
                            finresult = {"time": t2, "data": combined};

                            updateUser(id,stock,t2);
                            //res.json(temp);
                        }
                        else{
                            dat3=new Date(Date.parse(data));
                            console.log("dat3:"+dat3.getUTCHours);
                            var temp = [];

                            var datatime;
                            if(dat.getUTCMinutes()<10) {
                                datatime = dat.getUTCHours()+5 + ":0" + dat.getUTCMinutes() + ":00";
                            }else{
                                datatime = dat.getUTCHours()+5 + ":" + dat.getUTCMinutes() + ":00";
                            }
                            console.log("datatime"+datatime);

                            var usertime;
                            if(dat.getMinutes()<10) {
                                usertime = dat3.getUTCHours() + ":0" + dat3.getUTCMinutes() + ":00";
                            }else{
                                usertime = dat3.getUTCHours() + ":" + dat3.getUTCMinutes() + ":00";
                            }
                            console.log("usertime"+usertime);

                            _.each(JSON.parse(newsres), function (arr, key) {
                                dat2 = new Date(Date.parse(arr.date));


                                var newstime;
                                if(dat2.getMinutes()<10) {
                                    newstime = dat2.getHours() + ":0" + dat2.getMinutes() + ":00";
                                }else{
                                    newstime = dat2.getHours() + ":" + dat2.getMinutes() + ":00";
                                }
                                console.log("newstime"+newstime);

                                var min1 = moment(datatime, "HH:mm:ss").diff(moment(newstime, "HH:mm:ss"),'minutes');
                                var min2 = moment(newstime, "HH:mm:ss").diff(moment(usertime, "HH:mm:ss"),'minutes');
                                console.log("min1 "+min1+" min2:"+min2);
                                if ((min1>=0)&&(min2>=0)) {

                                    var news = {"title": arr.title, "link": arr.link};
                                    temp.push(news);
                                }
                                else {
                                    //var news = {};
                                    //temp.push(news);

                                }

                            });
                            var x={};
                            var n="news";
                            x[n]=temp;
                            var combined = _.extend(stockData, x);


                            var t=new Date();
                            t.setHours(dat.getUTCHours());
                            t.setMinutes(dat.getUTCMinutes());
                            finresult = {"time": t, "data": combined};
                            updateUser(id,stock,t);

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