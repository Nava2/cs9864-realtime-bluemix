// Here are the examples:
// http://client-service-registrar-cs9864-2016.mybluemix.net/ is the base url.
// PUT http://client-service-registrar-cs9864-2016.mybluemix.net/add?name=cs1&url=http://cs1.net
// GET http://client-service-registrar-cs9864-2016.mybluemix.net/listall 
// GET http://client-service-registrar-cs9864-2016.mybluemix.net/getname?url=http://cs1.net 
//   or  http://client-service-registrar-cs9864-2016.mybluemix.net/geturl?name=cs1
// DELETE http://client-service-registrar-cs9864-2016.mybluemix.net/byname?name=cs1 
//   or   http://client-service-registrar-cs9864-2016.mybluemix.net/byurl?url=http://cs1.net 

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
const cloudant = Cloudant(cloudant_cred.url);

const bsnamefield=cloudant_cred.bsnamefield;
const bsurlfield=cloudant_cred.bsurlfield;

collectionname = cloudant_cred.collectionname;
datefield = cloudant_cred.datefield;
// db = cloudant.use(collectionname);

var validUrl = require('valid-url');
var restler = require('restler');

getcollection(cloudant_cred.collectionname)
listIndexes(cloudant_cred.collectionname)
indexfields(cloudant_cred.bsnamefield, cloudant_cred.bsurlfield)

// get the collection. create it if it does not exist.
function getcollection(collectionname) {
    restler.put(cloudant_cred.host + '/' + collectionname, {
        username: cloudant_cred.user,
        password: cloudant_cred.password
    }).on('complete', function (data) {
        console.log(data);
    });
}

// list all the indexes of a specific collection
function listIndexes(collectionname) {
    db = cloudant.use(collectionname);
    db.index(function (er, result) {
        if(!!er) {
            throw er;
        }
        for (var i = 0; i < result.indexes.length; i++) {
            var tmp = result.indexes[i].def['fields'][0];
            for (k in tmp) {
                console.log('the indexed field: ' + k)
            }
            console.log('THe detail of the index: %s (%s): %j', result.indexes[i].name,
                result.indexes[i].type, result.indexes[i].def);
        }
    });
}

//prepare the index for query
function indexfields(bsnamefield, bsurlfield) {
    var flag = false;
    var indexarr = [];
    db.index(function (er, result) {
        if(!!er) {
            throw er;
        }
        // search all the indexes existed.
        console.log('The database has %d indexes', result.indexes.length);
        for (var i = 0; i < result.indexes.length; i++) {
            var tmp = result.indexes[i].def['fields'][0];
            for (k in tmp) {
                indexarr.push(k);
            }
        }

        //create index for the service name field if it does not exist.
        if (indexarr.indexOf(bsnamefield) == -1) {
            var dateindex = {name: 'bsname_index', type: 'json', index: {fields: [bsnamefield]}}
            db.index(dateindex, function (er, response) {
                if(!!er) {
                    throw er;
                }
                console.log('Index creation result: %s', response.result);
            });
        }
        //create index for the service name field if it does not exist.
        if (indexarr.indexOf(bsurlfield) == -1) {
            var dateindex = {name: 'bsurl_index', type: 'json', index: {fields: [bsurlfield]}}
            db.index(dateindex, function (er, response) {
                if(!!er) {
                    throw er;
                }
                console.log('Index creation result: %s', response.result);
            });
        }
        if (indexarr.indexOf("valid") == -1) {
            var dateindex = {name: 'valid_index', type: 'json', index: {fields: ["valid"]}}
            db.index(dateindex, function (er, response) {
                if(!!er) {
                    throw er;
                }
                console.log('Index creation result: %s', response.result);
            });
        }
    });
}

// eg. http://localhost:6004/add?name=s1&url=http://www.ss.com
// accept many different names refering to the same url.
// register a new service
app.put('/add', function (req, res) {
    regname = req.query.name;
    regurl = req.query.url;

    if (!validUrl.isUri(regurl)) {
        res.status(400).json({error: 'The url is not valid!'});
    }
    if (db) {
        // check deplicated bsname
        query={};
        query[bsnamefield]=regname;
        db.find({selector:query}, function(er, result) {
        // db.find({selector:{"valid":1,bsnamefield:regname}}, function(er, result) {
            if(!!er) {
                throw er;
            }
            if(result.docs.length>0){
                res.status(200).json({ error: 'this service has already existed!' });
            }else{
                query={};
                query["valid"]=1;
                query[bsnamefield]=regname;
                query[bsurlfield]=regurl;
                db.insert(query);
                // db.insert({"valid":1,bsnamefield:regname,bsurlfield:regurl});
                res.json({bsnamefield:regname, bsurlfield:regurl});
            }
        });
    }else{
        console.log('db is not running')
        res.status(400).json({error: 'db is not running'});
    }
});

// eg. http://localhost:6004/listall
// list all the services
app.get('/listall', function (req, res) {
    var m_arr=[];
    if (db) {
        // check deplicated bsname
        db.find({selector:{"valid":1}}, function(er, result) {
            if(!!er) {
                throw er;
                res.json({ error: 'can not access the db' });
            }
            for (var i = 0; i < result.docs.length; i++) {
                data={};
                data[bsnamefield]=result.docs[i][bsnamefield];
                data[bsurlfield]=result.docs[i][bsurlfield];
                m_arr.push(data);
            }
            res.json(m_arr);
        });
    }else{
        console.log('db is not running')
        res.status(400).json({error: 'db is not running'});
    }
});

//eg. http://localhost:6004/getname?url=http://www.ss3.com
// return the name given the url
app.get('/getname', function (req, res) {
    regurl = req.query.url;
    var m_arr=[];
    if (db) {
        // check deplicated bsname
        query={};
        query[bsurlfield]=regurl;
        db.find({selector:query}, function(er, result) {
            if(!!er) {
                throw er;
                res.json({ error: 'can not access the db' });
            }
            for (var i = 0; i < result.docs.length; i++) {
                data=result.docs[i][bsnamefield];
                m_arr.push(data);
            }
            res.json(m_arr);
        });
    }else{
        console.log('db is not running')
        res.status(400).json({error: 'db is not running'});
    }
});

// eg. http://localhost:6004/geturl?name=s1
// return the url given the name
app.get('/geturl', function (req, res) {
    regname = req.query.name;
    var m_arr=[];
    if (db) {
        // check deplicated bsname
        query={};
        query[bsnamefield]=regname;
        db.find({selector:query}, function(er, result) {
            if(!!er) {
                throw er;
                res.json({ error: 'can not access the db' });
            }
            for (var i = 0; i < result.docs.length; i++) {
                data=result.docs[i][bsurlfield]
                m_arr.push(data);
            }
            res.json(m_arr);
        });
    }else{
        console.log('db is not running')
        res.status(400).json({error: 'db is not running'});
    }
});

// list all the documents
app.get('/listalldocs', function(req,res){
    if (db) {
        restler.get(cloudant_cred.host + '/' + collectionname+'/_all_docs', {
            username: cloudant_cred.user,
            password: cloudant_cred.password
        }).on('complete', function (data) {
            res.json(data);
        });
    }
})


//delete the service by name
app.delete('/byname', function (req, res) {
    regname = req.query.name;
    var m_arr=[];
    if (db) {
        query={};
        query[bsnamefield]=regname;
        db.find({selector:query}, function(er, result) {
            if(!!er) {
                throw er;
                res.json({ error: 'can not access the db' });
            }
            for (var i = 0; i < result.docs.length; i++) {
                db.destroy(result.docs[i]._id,result.docs[i]._rev, function(err, data) {
                    if(!!er) {
                        throw er;
                    }
                });
            }
            res.json('deleted');
        });
    }else{
        console.log('db is not running')
        res.status(400).json({error: 'db is not running'});
    }
});

// delete the service by url
app.delete('/byurl', function (req, res) {
    regurl = req.query.url;
    var m_arr=[];
    if (db) {
        query={};
        query[bsurlfield]=regurl;
        db.find({selector:query}, function(er, result) {
            if(!!er) {
                throw er;
                res.json({ error: 'can not access the db' });
            }
            for (var i = 0; i < result.docs.length; i++) {
                db.destroy(result.docs[i]._id,result.docs[i]._rev, function(err, data) {
                    if(!!er) {
                        throw er;
                    }
                });
            }
            res.json('deleted');
        });
    }else{
        console.log('db is not running')
        res.status(400).json({error: 'db is not running'});
    }
});

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function () {

    // print a message when the server starts listening
    console.log("server starting on " + appEnv.url);
});