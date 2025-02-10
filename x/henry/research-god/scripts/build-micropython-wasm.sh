#!/bin/bash

# Exit on error
set -e

echo "Setting up MicroPython WASM..."

# Create necessary directories
mkdir -p src/wasm

# Download pre-built files from rafi16jan's micropython-wasm
echo "Downloading pre-built files..."
curl -L https://raw.githubusercontent.com/rafi16jan/micropython-wasm/master/lib/micropython.js -o src/wasm/micropython.js
curl -L https://raw.githubusercontent.com/rafi16jan/micropython-wasm/master/lib/firmware.wasm -o src/wasm/micropython.wasm
curl -L https://raw.githubusercontent.com/rafi16jan/micropython-wasm/master/lib/micropython.binary -o src/wasm/micropython.binary

echo "MicroPython WASM setup complete!" 