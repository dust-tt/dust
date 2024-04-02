# This script pulls the types from the Amplitude.
# You must have run `npx ampli login` before running this script.
cd ./lib/amplitude/node/
npx ampli pull  dust-node-prod -p ./generated 
cd -
cd ./lib/amplitude/browser/
npx ampli pull  dust-browser-prod -p ./generated 
cd -
npm run format
