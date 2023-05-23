#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"


# Change the current working directory to the parent directory of the script
cd "${SCRIPT_DIR}/.."

# Check the current working directory
echo "Current working directory is $(pwd)"

# Start the build and get its ID
echo "Starting build..."
BUILD_ID=$(gcloud builds submit --quiet --config "${SCRIPT_DIR}/cloudbuild.yaml" --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) --format='value(id)' .)

# Print the URL where the logs can be found
echo "View logs at: https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$GCLOUD_PROJECT_ID"
