#!/usr/bin/env bash
# Install the FoundationDB client library (libfdb_c) that dfs-api links against on macOS.
# Client-only install from the official installer, as described in
# https://apple.github.io/foundationdb/getting-started-mac.html (the database itself runs in Docker).
#
# Usage: tools/install-fdb-client.sh [--check]
#   --check  exit 0 if the library is installed, 1 otherwise; installs nothing.
set -euo pipefail

# Keep in sync with the foundationdb image in docker-compose.yml: client and server must share
# the same 7.3.x line.
FDB_VERSION=7.3.69
LIBRARY=/usr/local/lib/libfdb_c.dylib

# Linux installs the client from its own package (the dev container image does), so there is
# nothing to check or install here.
if [ "$(uname -s)" != "Darwin" ]; then
  [ "${1:-}" = "--check" ] && exit 0
  echo "This script only supports macOS. Install the FoundationDB clients package for your system:"
  echo "https://apple.github.io/foundationdb/downloads.html"
  exit 1
fi

if [ -e "$LIBRARY" ]; then
  [ "${1:-}" = "--check" ] || echo "FoundationDB client library already installed: $LIBRARY"
  exit 0
fi

if [ "${1:-}" = "--check" ]; then
  exit 1
fi

# Checksums are the ones GitHub publishes for the release assets.
case "$(uname -m)" in
  arm64)
    ARCH=arm64
    SHA256=6bfbd48ac21356de0baa0c1e84c6e33d15d95d0b9d022c35a7625e5d9293b71e
    ;;
  x86_64)
    ARCH=x86_64
    SHA256=f22f4471d06189df8bbaa5474b20d52647b5fb0e4d4516809890316b31a4df2a
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)"
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
PACKAGE="$WORK_DIR/FoundationDB-${FDB_VERSION}_${ARCH}.pkg"

echo "Downloading FoundationDB ${FDB_VERSION} (${ARCH})..."
curl -fsSL -o "$PACKAGE" \
  "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/FoundationDB-${FDB_VERSION}_${ARCH}.pkg"

echo "${SHA256}  ${PACKAGE}" | shasum -a 256 -c - >/dev/null || {
  echo "Checksum mismatch for the downloaded package."
  exit 1
}

# The installer bundles the server and the clients; extract the clients component as its own package.
pkgutil --expand "$PACKAGE" "$WORK_DIR/expanded"
pkgutil --flatten "$WORK_DIR/expanded/FoundationDB-clients.pkg" "$WORK_DIR/clients.pkg"
echo "Installing the client library into /usr/local (asks for your password)..."
sudo installer -pkg "$WORK_DIR/clients.pkg" -target /

if [ ! -e "$LIBRARY" ]; then
  echo "Installation finished but $LIBRARY is missing."
  exit 1
fi
echo "Installed $LIBRARY"
