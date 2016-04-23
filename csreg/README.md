# Node.js Starter Overview

The Node.js Starter demonstrates a simple, reusable Node.js web application based on the Express framework.

## Run the app locally

1. [Install Node.js][]
2. Download and extract the starter code from the Bluemix UI
3. cd into the app directory
4. Run `npm install` to install the app's dependencies
5. Run `npm start` to start the app
6. Access the running app in a browser at http://localhost:6001

[Install Node.js]: https://nodejs.org/en/download/


Here are the examples:
http://client-service-registrar-cs9864-2016.mybluemix.net/ is the base url.

PUT http://client-service-registrar-cs9864-2016.mybluemix.net/add?name=cs1&url=http://cs1.net
GET http://client-service-registrar-cs9864-2016.mybluemix.net/listall 
GET http://client-service-registrar-cs9864-2016.mybluemix.net/getname?url=http://cs1.net 
  or  http://client-service-registrar-cs9864-2016.mybluemix.net/geturl?name=cs1
DELETE http://client-service-registrar-cs9864-2016.mybluemix.net/byname?name=cs1 
  or   http://client-service-registrar-cs9864-2016.mybluemix.net/byurl?url=http://cs1.net 