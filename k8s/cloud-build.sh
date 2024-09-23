#!/bin/bash
set -e
set -x

SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"

# default values
WORKING_DIR=""
GCLOUD_IGNORE_FILE=""
IMAGE_NAME=""
DOCKERFILE_PATH=""
DUST_CLIENT_FACING_URL=""

# parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --working-dir=*)
      WORKING_DIR="${1#*=}"
      shift
      ;;
    --gcloud-ignore-file=*)
      GCLOUD_IGNORE_FILE="${1#*=}"
      shift
      ;;
    --image-name=*)
      IMAGE_NAME="${1#*=}"
      shift
      ;;
    --dockerfile-path=*)
      DOCKERFILE_PATH="${1#*=}"
      shift
      ;;
    --dust-client-facing-url=*)
      DUST_CLIENT_FACING_URL="${1#*=}"
      shift
      ;;
    *)
      echo "unknown argument: $1"
      exit 1
      ;;
  esac
done

# check required arguments
if [ -z "$WORKING_DIR" ] || [ -z "$IMAGE_NAME" ] || [ -z "$DOCKERFILE_PATH" ]; then
  echo "error: --working-dir, --image-name, and --dockerfile-path are required"
  exit 1
fi

if [ -n "$GCLOUD_IGNORE_FILE" ]; then
    GCLOUD_IGNORE_FILE_ARG="--ignore-file=$GCLOUD_IGNORE_FILE"
fi

# change the current working directory to the directory in which to build the image
cd "$WORKING_DIR"

# check the current working directory
echo "current working directory is $(pwd)"

# prepare substitutions
SUBSTITUTIONS="SHORT_SHA=$(git rev-parse --short HEAD),_IMAGE_NAME=$IMAGE_NAME,_DOCKERFILE_PATH=$DOCKERFILE_PATH"
if [ -n "$DUST_CLIENT_FACING_URL" ]; then
    SUBSTITUTIONS="$SUBSTITUTIONS,_DUST_CLIENT_FACING_URL=$DUST_CLIENT_FACING_URL"
fi

# start the build and get its id
echo "starting build..."
BUILD_ID=$(gcloud builds submit --quiet --config "${SCRIPT_DIR}/cloudbuild.yaml" ${GCLOUD_IGNORE_FILE_ARG} --substitutions=$SUBSTITUTIONS --format='value(id)' .)