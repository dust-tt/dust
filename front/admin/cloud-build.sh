#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"

_DOCKERFILE_PATH="${SCRIPT_DIR}/../Dockerfile"

echo "_DOCKERFILE_PATH is ${_DOCKERFILE_PATH}"

# Check if the Dockerfile exists and is readable
if [ -r "${_DOCKERFILE_PATH}" ]; then
    echo "Dockerfile exists and is readable"
else
    echo "Cannot read Dockerfile at ${_DOCKERFILE_PATH}"
    exit 1
fi

# Change the current working directory to the parent directory of the script
cd "${SCRIPT_DIR}/.."

# Check the current working directory
echo "Current working directory is $(pwd)"

# Start the build and get its ID
echo "Starting build..."
BUILD_ID=$(gcloud builds submit --quiet --config "${SCRIPT_DIR}/cloudbuild.yaml" --substitutions=SHORT_SHA=$(git rev-parse --short HEAD),_DOCKERFILE_PATH="${_DOCKERFILE_PATH}" --format='value(id)' .)

# Print the URL where the logs can be found
echo "View logs at: https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$GCLOUD_PROJECT_ID"
