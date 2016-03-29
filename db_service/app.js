const Cloudant = require('cloudant');
const cloudant_cred = require('./cloudant.json').credentials;
const cloudant = Cloudant(cloudant_cred.url);

dbname=cloudant_cred.dbname;
datefield=cloudant_cred.datefield;

db = cloudant.use(dbname);

var interval = 10;

//prepare the index for date field
var flag=false;
db.index(function(er, result) {
	if (er) {
    	throw er;
  	}
  	console.log('The database has %d indexes', result.indexes.length);
  	for (var i = 0; i < result.indexes.length; i++) {
    	var tmp=result.indexes[i].def['fields'][0];
  		for (k in tmp){
  			// console.log('-----'+k)
  			if(k==datefield){
  				flag=true;
  				break;	
  			}
  		}
  	}
  	//create index for date field
  	if(flag==false){
		var dateindex = {name:'date_index', type:'json', index:{fields:[datefield]}}
		db.index(dateindex, function(er, response) {
		  if (er) {
		    throw er;
		  }
		  console.log('Index creation result: %s', response.result);
		});
  	}
});

//get the date doundary
var today = new Date();
dateback(today, interval);

// destroy the documents from Cloudant according to the date restriction
db.find({selector:{datefield:""}}, 
	function(er, result) {
	  	for (var i = 0; i < result.docs.length; i++) {
		  	db.destroy(result.docs[i]._id,result.docs[i]._rev, function(err, data) {
		    	if (er) {
		    		throw er;
		  		}
			});
		}
	});
});


function dateback(date, interval) {
  var odate = new Date(date);
  odate = odate.valueOf();
  odate = odate - interval * 24 * 60 * 60 * 1000;
  odate = new Date(odate);
  console.log(odate.getFullYear() + "/" + (odate.getMonth() + 1) + "/" + odate.getDate() );
}
// dateback("2016/12/1", 2); //2016/11/29