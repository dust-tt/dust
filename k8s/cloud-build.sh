#!/bin/bash
set -e

# Default values
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"
WORKING_DIR=""
IMAGE_NAME=""
DOCKERFILE_PATH=""
REGION=""
GCLOUD_IGNORE_FILE=""
PROJECT_ID=""

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --working-dir=*)
            WORKING_DIR="${1#*=}"
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
        --region=*)
            REGION="${1#*=}"
            shift
            ;;
        --project-id=*)
            PROJECT_ID="${1#*=}"
            shift
            ;;
        --gcloud-ignore-file=*)
            GCLOUD_IGNORE_FILE="${1#*=}"
            shift
            ;;
        *)
            echo "Error: Unknown argument $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$WORKING_DIR" ] || [ -z "$IMAGE_NAME" ] || [ -z "$DOCKERFILE_PATH" ] || [ -z "$REGION" ] || [ -z "$PROJECT_ID" ]; then
    echo "Error: --working-dir, --image-name, --region, --project-id and --dockerfile-path are required"
    exit 1
fi

# Change to working directory
cd "$WORKING_DIR"

# Prepare the build command
BUILD_CMD=(gcloud builds submit --quiet --config "${SCRIPT_DIR}/cloudbuild.yaml" --service-account="projects/${PROJECT_ID}/serviceAccounts/cloudbuild-runtime@${PROJECT_ID}.iam.gserviceaccount.com")

if [ -n "$GCLOUD_IGNORE_FILE" ]; then
    BUILD_CMD+=(--ignore-file="$GCLOUD_IGNORE_FILE")
fi

# Add substitutions
BUILD_CMD+=(--substitutions="_PROJECT_ID=$PROJECT_ID,_REGION=$REGION,_IMAGE_NAME=$IMAGE_NAME,_DOCKERFILE_PATH=$DOCKERFILE_PATH,SHORT_SHA=$(git rev-parse --short HEAD)" .)

# Execute the build
"${BUILD_CMD[@]}"
