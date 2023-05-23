#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"


# Start the build and get its ID
BUILD_ID=$(gcloud builds submit --quiet --config "${SCRIPT_DIR}/cloudbuild.yaml" --substitutions=SHORT_SHA=$(git rev-parse --short HEAD),_DOCKERFILE_PATH="${SCRIPT_DIR}/../Dockerfile" --format='value(id)' .)


# Print the URL where the logs can be found
echo "View logs at: https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$GCLOUD_PROJECT_ID"
