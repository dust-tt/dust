#!/bin/sh

set -e

echo "-----------------------------------"
echo "Applying configmaps"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/configmaps/front-configmap.yaml"

echo "-----------------------------------"
echo "Applying deployments"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/deployments/front-deployment.yaml"