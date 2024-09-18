#!/bin/sh
# first arg : name of image to build
# second arg: path to the Dockerfile, relative to the resolved WORKING_DIR.
# thid arg : path to the docker build context.
set -e
set -x

SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"
WORKING_DIR="${3}"
GCLOUD_IGNORE_FILE="${5}"

if [ -n "$GCLOUD_IGNORE_FILE" ]; then
    GCLOUD_IGNORE_FILE_ARG="--ignore-file=$GCLOUD_IGNORE_FILE"
fi




# Change the current working directory to the directory in which to build the image
cd "$WORKING_DIR"

# Check the current working directory
echo "Current working directory is $(pwd)"

# Start the build and get its ID
echo "Starting build..."
BUILD_ID=$(gcloud builds submit --quiet --config "${SCRIPT_DIR}/cloudbuild.yaml" ${GCLOUD_IGNORE_FILE_ARG} --substitutions=SHORT_SHA=$(git rev-parse --short HEAD),_IMAGE_NAME=$1,_DOCKERFILE_PATH=$2,DUST_CLIENT_FACING_URL=$4 --format='value(id)' .)
