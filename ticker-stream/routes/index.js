'use strict';

const express = require('express');
const router = express.Router();

const _ = require('lodash');


module.exports = (winston) => {


  const w = (!!winston ? winston : require('winston'));

  /* GET home page. */
  router.get('/', (req, res) => {
      res.render('index');
  });

  return router;
};
