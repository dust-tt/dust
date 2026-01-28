#!/bin/bash

# Where the script is defined, absolute path
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# Tiny script to start the dev environment using mprocs.
# Needed to clear the dist of the sdks-js project before starting front so it waits for the sdks-js to be ready.

# Clear the dist of the sdks-js project
rm -rf $SCRIPT_DIR/../sdks/js/dist
# rm -rf $SCRIPT_DIR/../node_modules/isomorphic-dompurify $SCRIPT_DIR/../node_modules/@elevenlabs/

# Install npm workspaces dependencies
cd $SCRIPT_DIR/../ && npm install

cd $SCRIPT_DIR

# Start the dev environment using mprocs
mprocs