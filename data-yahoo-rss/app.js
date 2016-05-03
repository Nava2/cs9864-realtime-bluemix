
'use strict'
// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

//Use lodash
var _ = require('lodash');


// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

//Setup RSS Feed Parser

var parser = require('parse-rss');

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

//get the Data from the feed and through the rss to JSON translator.
// Pass in stock and callback function
function getData (str,callback) {
    let url='http://finance.yahoo.com/rss/headline?s='+str;
    parser(url,function (err, rss) {
        if (rss==null) {
            console.log("An error has occured. Abort everything!");
            console.log(err);
            callback(null);
        }
        else {

            var result=_.map(rss, (key)=>{

                let star=key.link.indexOf('*');
                let length=key.link.length;
                let link =key.link.substring(star+1,length);

               return ({guid: key.guid,title: key.title, date: key.date,link:link});

            });
            callback(result);
        }
    });
}

// //Example : http://localhost:6003/getData?stockname=AAPL
app.get('/Data', function (req, res) {
    let stock = req.query.stockname.toUpperCase();

    getData(stock,function(data) {
        if(data!==null) {
            var int =data.filter(function(n){
                var b = new Date();
                if(n.date.getDate()==b.getDate() && n.date.getYear()==b.getYear()){
                    return n;
                }
            });
            if(int.length==0){
                res.json("no data");
                
            }
            else {
                res.json(int);
            }

        }
        else{res.status(400).send({ error: 'Invalid Stock' });}
    });
});

// start server on the specified port and binding host
app.listen(appEnv.port, function () {

    // print a message when the server starts listening
    console.log("server starting on " + appEnv.url);
});