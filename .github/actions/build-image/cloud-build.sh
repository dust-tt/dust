#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --image-name=*)
            IMAGE_NAME="${1#*=}"
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
        *)
            echo "Error: Unknown argument $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$IMAGE_NAME" ] || [ -z "$REGION" ] || [ -z "$PROJECT_ID" ]; then
    echo "Error: --image-name, --region, and --project-id are required"
    exit 1
fi

DOCKERFILE_PATH="./dockerfiles/${IMAGE_NAME}.Dockerfile"

if [ ! -f "$DOCKERFILE_PATH" ]; then
    echo "Error: Dockerfile $DOCKERFILE_PATH does not exist"
    exit 1
fi

# Execute build
gcloud builds submit --quiet \
    --config "${SCRIPT_DIR}/cloudbuild.yaml" \
    --service-account="projects/${PROJECT_ID}/serviceAccounts/cloudbuild-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
    --substitutions="_PROJECT_ID=$PROJECT_ID,_REGION=$REGION,_IMAGE_NAME=$IMAGE_NAME,_DOCKERFILE_PATH=$DOCKERFILE_PATH,SHORT_SHA=$(git rev-parse --short HEAD)" \
    .