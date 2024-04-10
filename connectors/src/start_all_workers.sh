#!/bin/bash

# Bash scripts that starts all the workers in the background
# and fails when any of them fails.
# The return code of the first failing worker is returned 
# as the return code of this script.

fail() {
    wait -n
    exit $?
}

npm run start:worker -- --workers confluence & 
npm run start:worker -- --workers github & 
npm run start:worker -- --workers google_drive & 
npm run start:worker -- --workers intercom & 
# npm run start:worker -- --workers notion &  // notion is running on its own pod so no need to run it here
npm run start:worker -- --workers slack &
npm run start:worker -- --workers webcrawler & 


fail