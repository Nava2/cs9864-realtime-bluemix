# ticker-stream

Simple demo for running an express app on bluemix, it queries cloudant for data. 

This application will not run later since the cloudant service will be dead by then. 

## Running

3. Edit `config.bluemix.json` with the identity information from Bluemix
4. Run `node ./app.js`

## Bluemix

1. `bluemix login`
2. `cf push`
3. Open browser to [application](http://ticker-stream-cs9864-2016.mybluemix.net/)

