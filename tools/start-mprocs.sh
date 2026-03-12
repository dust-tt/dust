#!/bin/bash

# Where the script is defined, absolute path
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# Source and install the correct node version using nvm.
# If DUST_NODE_VERSION is set (e.g. via `source scripts/try-node24.sh`), use that version
# instead of the .nvmrc default.
source ~/.nvm/nvm.sh
if [ -n "${DUST_NODE_VERSION:-}" ]; then
  nvm install "$DUST_NODE_VERSION"
  nvm use "$DUST_NODE_VERSION"
else
  nvm install
fi

# Tiny script to start the dev environment using mprocs.
# Needed to clear the dist of the sdks-js project before starting front so it waits for the sdks-js to be ready.

# Clear the dist of the sdks-js projectst
rm -rf "$SCRIPT_DIR"/../sdks/js/dist

# Install npm workspaces dependencies
cd "$SCRIPT_DIR"/../ && npm install

cd $SCRIPT_DIR

# Start the dev environment using mprocs
mprocs