#!/usr/bin/env zsh

set -euo pipefail

(cd front && npm install)
(cd connectors && npm install)
(cd extension && npm install)
(cd sdks/js && npm install)
(cd sparkle && npm install)

