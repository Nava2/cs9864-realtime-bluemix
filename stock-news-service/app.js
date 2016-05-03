
'use strict'


const Cloudant = require('cloudant');

const cloudant_cred = require('./cloudant.json').credentials;
const service_add= require('./config.json').addresses;


// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

var request=require('request');

var Chance = require('chance');

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
var stockcollection = cloudant_cred.collectionname1;



//Get the Data service address
const datab=service_add.databaseservice;
const aggservice=service_add.aggservice;
const yahoo=service_add.yahoorss;

function getStockList(callback) {
  var db = cloudant.use(stockcollection);
  var my_arr=[];
  if (db) {
    var query = { selector: {"_id": {"$gt": 0}}};
    db.find(query, function(er, result) {
      if(!!er) {
        console.log(er);
        callback(null);

      }
        console.log(JSON.stringify(result));
      for (var i = 0; i < result.docs.length; i++) {
        var data={};
        if(result.docs[i]["stockname"]!==undefined) {
          data["stockname"] = result.docs[i]["stockname"];
          my_arr.push(data);
        }
      }
      callback(my_arr);
    });
  }else{
    console.log('db is not running')
    //var a={error: 'db is not running'};
    callback(null);
  }

};



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

   let a = yahoo+"/getData?stockname="+str;
  //console.log(a);

  request(a, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      callback(body);
    }
    else{
      callback(null);
    }
  });
}

function getFeed(hostId,stock, callback){

    var a = aggservice+"/getDataSince?stockname="+stock+"&guid="+hostId;
    //console.log(a);

    request(a, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            //console.log(JSON.parse(body));
            callback(body);
        }
        else{
            callback(null);
        }
    });
}

app.post('/register', function (req, res){
    var chance = new Chance();

// Use Chance here.
    var my_random_string = chance.string();

    res.status(200).send(my_random_string)

});

///Example : http://localhost:6003/getDataSync?stockname=AAPL
app.get('/data', function (req, res) {

    //Grab the stock argument
    if(req.query.stockname==undefined || req.query.guid==undefined){
        res.status(400).json({"error": "Need to pass stockname parameter"});

    }else {
        //Grab the stock argument
        let stock = req.query.stockname.toUpperCase();
        let id = req.query.guid;

        getStockList(function (stockList) {
            let a = true;
            console.log("stock " + stock);
            for (var j = 0; j < stockList.length; j++) {
                console.log(stockList[j].stockname);
                if (stock === stockList[j].stockname) {
                    a = false;
                }
            }
            let b = [stock.toString()];
            console.log(b);
            console.log(a);
            if (a) {
                console.log("try to add ticker");

                request.put({
                    url: datab + '/api/tickers',
                    json: {
                        "tickers": b
                    }
                }, (err, res, body) => {
                    if (!!err) {
                        throw err;
                    }
                    if (!!body.success) {
                        // successfully registered :3
                    } else {
                        // w.warn("wtf? %s", body.err);
                    }
                });
            }
            getFeed(id, stock, function (data) {
                if (data == null) {
                    res.status(503).json("error no data");
                }
                else {
                    res.json(JSON.parse(data));
                }
            });
        });


    }

  });

app.get('/news', function (req, res) {

    //Grab the stock argument
    if(req.query.stockname==undefined){
        res.status(400).json({"error": "Need to pass stockname parameter"});

    }else {
        //Grab the stock argument
        let stock = req.query.stockname.toUpperCase();

        getNews(stock, function (data) {
            if (data == null) {
                res.status(503).json({"error":"error no data"});
            }
            else {
                res.json(JSON.parse(data));
            }
        });

    }




});



// start server on the specified port and binding host
app.listen(appEnv.port, function () {

  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});