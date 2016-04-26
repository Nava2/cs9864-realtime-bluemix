//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------
var restler = require('restler');

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

const Cloudant = require('cloudant');
const cloudant_cred = require('./cloudant.json').credentials;
const param = require('./cloudant.json').param;

const cloudant = Cloudant(cloudant_cred.url);

db = cloudant.use(cloudant_cred.collectionname);
getcollection(cloudant_cred.collectionname);
indexfields(param.datefield);

// create an index if it does not exist
function indexfields(fieldname) {
    var flag = false;
    var indexarr = [];
    db.index(function (er, result) {
        if (er) {
            console.log(er);
        }
        // search all the indexes existed.
        console.log('The database has %d indexes', result.indexes.length);
        for (var i = 0; i < result.indexes.length; i++) {
            var tmp = result.indexes[i].def['fields'][0];
            for (k in tmp) {
                indexarr.push(k);
            }
        }
        // index the field if it does not exist.
        if (indexarr.indexOf(fieldname) == -1) {
            var dateindex = {name: fieldname+'_index', type: 'json', index: {fields: [fieldname]}}
            db.index(dateindex, function (er, response) {
                if (er) {
                    console.log(er);
                }
                console.log('Index creation result: %s', response.result);
            });
        }
    });
}

app.get('/cleandb', function (req, res) {
    var later = require('later');
    later.date.localTime();
    console.log("Now:" + new Date());
// var sched = later.parse.recur().every(1).second(),
    var sched = later.parse.recur().every(1).day(),
        t = later.setInterval(function () {
            cleandb();
            // what is the res??
        }, sched);
});

function cleandb(){
    //get the date boundary
    var today = new Date();
    boundary = dateback(today, param.interval);

    // destroy the documents from Cloudant according to the date restriction
    query = {};
    query[datefield] = {"$lte": boundary};
    db.find({selector: query}, function (er, result) {
        for (var i = 0; i < result.docs.length; i++) {
            db.destroy(result.docs[i]._id, result.docs[i]._rev, function (err, data) {
                if (er) {
                    console.log(er);
                }
            });
        }
    });
}

function dateback(date, interval) {
    var odate = new Date(date);
    odate = odate.valueOf();
    odate = odate - interval * 24 * 60 * 60 * 1000;
    odate = new Date(odate);
    //console.log(odate.getFullYear() + "/" + (odate.getMonth() + 1) + "/" + odate.getDate() );
    return odate;
}

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function () {
    // print a message when the server starts listening
    console.log("server starting on " + appEnv.url);
});