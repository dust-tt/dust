#!/bin/sh

set -e

# Start the build and get its ID
BUILD_ID=$(gcloud builds submit --quiet --config cloudbuild.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) --format='value(id)' .)

# Print the URL where the logs can be found
echo "View logs at: https://console.cloud.google.com/cloud-build/builds/$BUILD_ID?project=$GCLOUD_PROJECT_ID"
