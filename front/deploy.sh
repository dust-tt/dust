#!/bin/sh

set -e

echo "-----------------------------------"
echo "Building the image on Cloud Build"
echo "-----------------------------------"

"$(dirname "$0")/cloud-build.sh"

echo "-----------------------------------"
echo "Deploying the image on Kubernetes"
echo "-----------------------------------"

image_tag=$(git rev-parse --short HEAD)
gcloud_project_id=$(gcloud config get-value project)

kubectl set image deployment/front web=gcr.io/$gcloud_project_id/front-image:$image_tag
echo "Updated front image to: gcr.io/$gcloud_project_id/front-image:$image_tag"

