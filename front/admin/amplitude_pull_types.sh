# This script pulls the types from the Amplitude.
# You must have run `npx ampli login` before running this script.
cd ./lib/tracking/amplitude/server/
npx ampli pull  dust-node-prod -p ./generated 
cd -
cd ./lib/tracking/amplitude/client/
npx ampli pull  dust-browser-prod -p ./generated 
cd -
npm run format
