#!/bin/sh

set -e

echo "-----------------------------------"
echo "Building the images on Cloud Build"
echo "-----------------------------------"

"$(dirname "$0")/cloud-build.sh"

echo "-----------------------------------"
echo "Deploying the images on Kubernetes"
echo "-----------------------------------"

web_image_tag=$(git rev-parse --short HEAD)
worker_image_tag=$(git rev-parse --short HEAD)
gcloud_project_id=$(gcloud config get-value project)

kubectl set image deployment/connectors-web web=gcr.io/$gcloud_project_id/connectors-web-image:$web_image_tag
echo "Updated connectors-web image to: gcr.io/$gcloud_project_id/connectors-web-image:$web_image_tag"

kubectl set image deployment/connectors-worker worker=gcr.io/$gcloud_project_id/connectors-worker-image:$worker_image_tag
echo "Updated connectors-worker image to: gcr.io/$gcloud_project_id/connectors-worker-image:$worker_image_tag"
