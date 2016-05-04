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
'use strict';

const path = require('path');

const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');

const w = require('winston');

const config = require('blue-config')(path.join(__dirname, 'config'));

const DB_NAME = 'cs-reg';

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('combined', {
  // skip: function (req, res) { return res.statusCode < 400 }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'bower_components')));

// Load routes
const index = require('./routes/index');
const api = require('./routes/api')(DB_NAME);

app.use('/', index);
app.use('/api', api.router);

require('./lib/heartbeat')(api.get_database);

// start server on the specified port and binding host
app.listen(config.port, () => {
    // print a message when the server starts listening
    console.log("server starting on " + config.url);
});
