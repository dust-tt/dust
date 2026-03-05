#!/bin/bash

# Opt-in script to test Node 24 locally.
# Usage: source scripts/try-node24.sh
# To switch back: unset DUST_NODE_VERSION && nvm use

# Guard: must be sourced, not executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Error: this script must be sourced, not executed."
  echo "Usage: source scripts/try-node24.sh"
  exit 1
fi

NODE24_VERSION="24"

if ! command -v nvm &>/dev/null; then
  # nvm is a shell function, try loading it
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

if ! command -v nvm &>/dev/null; then
  echo "Error: nvm is not installed. Install it from https://github.com/nvm-sh/nvm"
  return 1
fi

echo "Installing Node ${NODE24_VERSION} (if not already installed)..."
nvm install "$NODE24_VERSION"

echo "Switching to Node ${NODE24_VERSION} for this session..."
nvm use "$NODE24_VERSION"

# Export so start-mprocs.sh and other scripts respect this choice.
export DUST_NODE_VERSION="$NODE24_VERSION"

echo ""
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"
echo ""
echo "You're now running Node ${NODE24_VERSION}. The .nvmrc still points to 22."
echo "DUST_NODE_VERSION=${NODE24_VERSION} is exported for downstream scripts."
echo "Run 'unset DUST_NODE_VERSION && nvm use' to switch back."
