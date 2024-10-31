#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils.sh"

# By convention, the name of the folder enclosing this script is the cluster name
CLUSTER_NAME=$(basename $(dirname "$0"))

check_context $CLUSTER_NAME

install_datadog_agent

echo "-----------------------------------"
echo "Applying configmaps"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/configmaps/proxy-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/socks-proxy-configmap.yaml"

echo "-----------------------------------"
echo "Applying deployments"
echo "-----------------------------------"

apply_deployment proxy-deployment
apply_deployment socks-proxy-deployment

echo "-----------------------------------"
echo "Applying services"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/services/proxy-service.yaml"
kubectl apply -f "$(dirname "$0")/services/socks-proxy-service.yaml"

echo "-----------------------------------"
echo "Applying network policies"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/network-policies/restrict-egress.yaml"
kubectl apply -f "$(dirname "$0")/network-policies/restrict-ingress.yaml"
