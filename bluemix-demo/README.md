# bluemix demo

Simple demo for running an express app on bluemix, it queries cloudant for data. 

This application will not run later since the cloudant service will be dead by then. 

## Running

1. Download the cloudant identity information from bluemix
2. Copy `cloudant.template.json` as `cloudant.json`
3. Edit `cloudant.json` with the identity information from Bluemix
4. Run `node ./app.js`

## Bluemix

1. `bluemix login`
2. `cf push cs9864-bluemix-demo -m 256M`
3. Open browser to [application](http://cs9864-bluemix-demo.mybluemix.net/?ticker=aapl)

## Warning

**NEVER COMMIT `cloudant.json` to the repository**