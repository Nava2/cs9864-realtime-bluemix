'use strict';

const url = require('url');
const util = require('util');

const express = require('express');
const router = express.Router();

const _ = require('lodash');
const moment = require('moment');
const request = require('request');

const config = require('../config');

var restler = require('restler');

const remoteHref = config.isLocal ? {
  protocol: "http:",
  hostname: config.locals.client.hostname,
  port: config.port,
  pathname: config.locals.client.pathname
} : _.extend(url.parse(config.url), { protocol: "http:", pathname: config.locals.client.pathname });
// const remoteUrl = url.format(_.isString(config.remote.href) ? url.parse(config.remote.href) : config.remote.href);

const Cloudant = require('cloudant');

const cloudant_cred = require('../cloudant.json').credentials;



module.exports = (store, winston) => {

  // Get the database from the config. object
  const cloudant = Cloudant(cloudant_cred.url);
  var stockcollection = cloudant_cred.collectionname1;
  var stockdatacollection = cloudant_cred.collectionname2;
  //Setting up the databases ensure database is up and running
  const stockname="stockname";
  const datetimefield="datetime";
  getcollection(stockcollection);
  getcollection(stockdatacollection);
  listIndexes(stockcollection);
  listIndexes(stockdatacollection);
  createindexfields(stockcollection,stockname);
  createindexfields(stockdatacollection,stockname);
  createindexfields(stockdatacollection,datetimefield);
  //Make sure that the service is registered for all the required stocks
  updateRegistration();

  //Setup logger
  const w = (!!winston ? winston : require('winston'));


  // Get the collection. Create it if it does not exist.
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

  // Prepare the index for query for a specific collection
  function createindexfields(dataSource,indexname) {
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
        var nameindex = {name: 'stockname_index', type: 'json', index: {fields: [indexname]}}
        db.index(nameindex, function (er, response) {
          if (!!er) {
            throw er;
          }
          console.log('Index creation result: %s', response.result);
        });
      }
    });
  }

  // Register with the stream handler with all stocks we are supposed to
  function updateRegistration(){
    getStockList(function (stockList) {
      var arr=[];
      for(var j = 0; j < stockList.length; j++) {
        arr[j]=stockList[j].stockname
      }
      console.log("updated stock list: "+arr);
      request.put({
        url: config.getServiceURL("stock-client") + 'register',
        json: {
          href: remoteHref,
          verb: config.locals.client.verb,
          tickers: arr
        }
      }, (err, res, body) => {

        if (!!err) {
          throw err;
        }
        w.info(util.inspect(body));
        if (!!body.success) {
          // successfully registered :3
        } else {
          w.warn("wtf? %s", body.err);
        }
      });

    });
  }

  // Add new ticker to the stock list database
  function addTicker (ticker) {

    var regname = ticker;
    var db = cloudant.use(stockcollection);
      if (db) {
        // check for duplicated stock
        var query={};
        query[stockname]=regname;
        db.find({selector:query}, function(er, result) {
          if(!!er) {
            throw er;
          }
          if(result.docs.length>0){
            var a= { error: 'this stock is already being saved!' };
            return a;
          }else{
            query={};
           // query["valid"]=1;
            query[stockname]=regname;
            db.insert(query);
          }
        });
      }else{
        console.log('db is not running');
      }
    };

  // Get the list of tickers we need to be registered for
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
        for (var i = 0; i < result.docs.length; i++) {
          var data={};
          if(result.docs[i][stockname]!==undefined) {
            data[stockname] = result.docs[i][stockname];
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

  // Returns a json array of all the stocks that we are monitoring
  // Example : http://localhost:6004/api/allstocks
  router.get('/allstocks', function (req, res) {
    var db = cloudant.use(stockcollection);
    var m_arr=[];
    if (db) {
      var query = { selector: {"_id": {"$gt": 0}}};
      db.find(query, function(er, result) {
        console.log(result);
        console.log(er);
        if(!!er) {
          res.json({ error: 'cannot access the db' });
          throw er;
        }
        for (var i = 0; i < result.docs.length; i++) {
          var data={};
          data[stockname]=result.docs[i][stockname];
          console.log("adding "+JSON.stringify(data));
          m_arr.push(data);
        }
        res.json(m_arr);
      });
    }else{
      console.log('db is not running')
      res.status(400).json({error: 'db is not running'});
    }
  });

  // We receive data here from the stream handler
  router.put('/data', (req,res)=>{

    // Respond to stream handler right away
    res.json({success: true});

    // Get Relevant Data from req
    const body = req.body;
    const tickers = body.tickers.map(_.lowerCase);
    var dat = new Date(Date.parse(req.body.when));
    console.log("tickers in data: "+tickers);


    // Iterate over each stock
    _.each(req.body.payload, (arr, key) => {

      //Create entry context (time and stock)
      var ctx = {"stockname":key,"datetime":dat};

      //Reduce all the payload
      var a=_.reduce(arr,function(result,value,index){
        if(index==0){
          result.push({
            idnum: value.id,
            transactions:value.size,
            price:value.price,
            suspicious:value.sus
          })}
        else{
          result.push({
            idnum: value.id,
            transactions:value.size+result[index-1].transactions,
            price:value.price,
            suspicious:value.sus+result[index-1].suspicious,
          })}
        return result;
      },[]);

      // Grab the last entry of the payload reduction, this is what we save
      var lastData=_.extend(ctx,a[a.length-1]);

      //Let save the last entry to the db
      var db = cloudant.use(stockdatacollection);
      if (db) {

        // lets see if we already have an entry for this stock
        var query={};
        query[stockname]=key;
        db.find({selector:query}, function(er, result) {
          if(!!er) {
            throw er;
          }
          if(result.docs.length==1){

            //exists, lets update
            result.docs[0].stockname=lastData.stockname;
            result.docs[0].datetime=lastData.datetime;
            result.docs[0].idnum=lastData.idnum;
            result.docs[0].transactions=lastData.transactions;
            result.docs[0].price=lastData.price;
            result.docs[0].suspicious=lastData.suspicious;

            db.insert( result.docs[0],  result.docs[0]._id, function(err, doc) {
              if(err) {
                // console.log('Error Updating data\n'+err);
                return 500;
              }
              //console.log('Success Updating\n');
              return 200;
            });


          }else{
            db.insert(lastData, function(err, doc) {
              if(err) {
                // console.log('Error inserting data\n'+err);
                return 500;
              }
              //console.log('Success Inserting\n');
              return 200;
            });
          }
        });
      }else{
        console.log('db is not running');
      }
    });
  });

  // We receive data here from the stream handler
  router.post('/data', (req, res) => {
    
    // Respond to stream handler right away
    res.json({success: true});
    
    // Get Relevant Data from req
    const body = req.body;
    const tickers = body.tickers.map(_.lowerCase);
    var dat = new Date(Date.parse(req.body.when));
    console.log("tickers in data: "+tickers);

 
    // Iterate over each stock
    _.each(req.body.payload, (arr, key) => {
      
      //Create entry context (time and stock)
      var ctx = {"stockname":key,"datetime":dat};

      //Reduce all the payload
      var a=_.reduce(arr,function(result,value,index){
        if(index==0){
        result.push({
          idnum: value.id,
          transactions:value.size,
          price:value.price,
          suspicious:value.sus
        })}
        else{
          result.push({
            idnum: value.id,
            transactions:value.size+result[index-1].transactions,
            price:value.price,
            suspicious:value.sus+result[index-1].suspicious,
        })}
        return result;
      },[]);
      
      // Grab the last entry of the payload reduction, this is what we save
      var lastData=_.extend(ctx,a[a.length-1]);

      //Let save the last entry to the db
      var db = cloudant.use(stockdatacollection);
      if (db) {

        // lets see if we already have an entry for this stock
       var query={};
        query[stockname]=key;
        db.find({selector:query}, function(er, result) {
          if(!!er) {
            throw er;
          }
          if(result.docs.length==1){

           //exists, lets update
            result.docs[0].stockname=lastData.stockname;
            result.docs[0].datetime=lastData.datetime;
            result.docs[0].idnum=lastData.idnum;
            result.docs[0].transactions=lastData.transactions;
            result.docs[0].price=lastData.price;
            result.docs[0].suspicious=lastData.suspicious;

            db.insert( result.docs[0],  result.docs[0]._id, function(err, doc) {
                    if(err) {
                      console.log('Error Updating data\n'+err);
                      return 500;
                    }
                  console.log('Success Updating\n');
                    return 200;
                  });


          }else{
            db.insert(lastData, function(err, doc) {
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
    });
  });
 

  // Used to send tickers we need to register for here, we register them
  // Example : http://localhost:6004/api/tickers and pass in json {"tickers":["a","b"]}
  router.post('/tickers', (req, res) => {

    const tickers = req.body.tickers.map(_.upperCase);
    var tobeadded = [];
    var temp = false;
    getStockList(function (stockList) {
      var arr=[];
      for(var j = 0; j < stockList.length; j++) {
        arr[j]=stockList[j].stockname
      }
      console.log("stockname array "+arr);
        for (var i = 0; i < tickers.length; i++) {
          if(arr.length==0){
            addTicker(tickers[i]);
            tobeadded.push(tickers[i]);
            temp = true;
          }
          else if (arr.indexOf(tickers[i])==-1) {
            addTicker(tickers[i]);
            tobeadded.push(tickers[i]);
            temp = true;
          }
        }
      if(temp){
        var myStocks=arr.concat(tobeadded);
        console.log("new stock list: "+myStocks);
        request.put({
          url: config.getServiceURL("stock-client") + 'register',
          json: {
            href: remoteHref,
            verb: config.locals.client.verb,
            tickers: myStocks
          }
        }, (err, res, body) => {
          if (!!err) {
            throw err;
          }
          w.info(util.inspect(body));
          if (!!body.success) {
            // successfully registered :3
          } else {
            w.warn("wtf? %s", body.err);
          }
        });
        res.json({success: true});
      }else {
        console.log("no new tickers to be added");
        res.json({success: true});
      }
    });
  });

  // Used to send tickers we need to register for here, we register them
  // Example : http://localhost:6004/api/tickers and pass in json {"tickers":["a","b"]}
  router.put('/tickers', (req, res) => {

    const tickers = req.body.tickers.map(_.upperCase);
    var tobeadded = [];
    var temp = false;
    getStockList(function (stockList) {
      var arr=[];
      for(var j = 0; j < stockList.length; j++) {
        arr[j]=stockList[j].stockname
      }
      console.log("stockname array "+arr);
      for (var i = 0; i < tickers.length; i++) {
        if(arr.length==0){
          addTicker(tickers[i]);
          tobeadded.push(tickers[i]);
          temp = true;
        }
        else if (arr.indexOf(tickers[i])==-1) {
          addTicker(tickers[i]);
          tobeadded.push(tickers[i]);
          temp = true;
        }
      }
      if(temp){
        var myStocks=arr.concat(tobeadded);
        console.log("new stock list: "+myStocks);
        request.put({
          url: config.getServiceURL("stock-client") + 'register',
          json: {
            href: remoteHref,
            verb: config.locals.client.verb,
            tickers: myStocks
          }
        }, (err, res, body) => {
          if (!!err) {
            throw err;
          }
          w.info(util.inspect(body));
          if (!!body.success) {
            // successfully registered :3
          } else {
            w.warn("wtf? %s", body.err);
          }
        });
        res.json({success: true});
      }else {
        console.log("no new tickers to be added");
        res.json({success: true});
      }
    });
  });

  return router;
};
