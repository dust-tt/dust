#!/bin/bash

# Where the script is defined, absolute path
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# Load the repo-root .env into the environment without `source`-ing it as shell
# code: the file is a 1Password-managed KEY=VALUE dump, not valid shell (it can
# contain a bare doc-comment line and unquoted/unescaped JSON values), so
# `source`/`eval` on it either fails outright or silently drops every
# assignment. Line-by-line regex extraction only ever assigns literal values.
load_env_file() {
  local file="$1"
  # NB: -e, not -f — this repo's .env is a 1Password-managed named pipe, not a
  # regular file, and -f would always report it missing.
  [ -e "$file" ] || return 0
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      export "$key=$value"
    fi
  done < "$file"
}
load_env_file "$SCRIPT_DIR/../.env"

# 1Password only gives us the GCP credentials as inline JSON; front-api reads
# SERVICE_ACCOUNT as a file path (same materialization dev/scripts/common.sh
# does for the container workflow).
if [ -n "${GCP_SERVICE_ACCOUNT:-}" ]; then
  printf '%s' "$GCP_SERVICE_ACCOUNT" > "${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"
  export SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"
fi

# Skip the Docker daemon check when already running inside a container.
if [ ! -f /.dockerenv ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Please start Docker Desktop/Orb Stack and try again."
    exit 1
  fi
fi

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
export DUST_USE_START_MPROCS=1
mprocs