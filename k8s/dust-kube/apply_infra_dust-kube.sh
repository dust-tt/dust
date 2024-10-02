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

kubectl apply -f "$(dirname "$0")/configmaps/apache-tika-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-upsert-table-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-edge-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-qa-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/connectors-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/connectors-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/connectors-worker-specific-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/alerting-temporal-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/core-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/core-sqlite-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/oauth-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/prodbox-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/viz-configmap.yaml"

echo "-----------------------------------"
echo "Applying backend configs"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/backend-configs/apache-tika-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/front-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/connectors-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/metabase-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/core-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/oauth-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/viz-backend-config.yaml"

echo "-----------------------------------"
echo "Applying managed certificates"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/managed-certs/front-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/front-edge-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/front-qa-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/connectors-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/metabase-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/viz-managed-cert.yaml"


echo "-----------------------------------"
echo "Applying frontend configs"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/frontend-configs/dust-frontend-config.yaml"

echo "-----------------------------------"
echo "Applying deployments"
echo "-----------------------------------"

apply_deployment apache-tika-deployment
apply_deployment front-deployment
apply_deployment front-worker-deployment
apply_deployment front-upsert-table-worker-deployment
apply_deployment front-edge-deployment
apply_deployment front-qa-deployment
apply_deployment connectors-deployment
apply_deployment connectors-worker-deployment
apply_deployment connectors-worker-notion-deployment
apply_deployment connectors-worker-notion-gc-deployment
apply_deployment connectors-worker-webcrawler-deployment
apply_deployment connectors-worker-google-drive-deployment
apply_deployment metabase-deployment
apply_deployment alerting-temporal-deployment
apply_deployment core-deployment
apply_deployment core-sqlite-worker-deployment
apply_deployment oauth-deployment
apply_deployment prodbox-deployment
apply_deployment viz-deployment

echo "-----------------------------------"
echo "Applying HPAs"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/hpas/apache-tika-hpa.yaml"

echo "-----------------------------------"
echo "Applying services"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/services/apache-tika-service.yaml"
kubectl apply -f "$(dirname "$0")/services/front-service.yaml"
kubectl apply -f "$(dirname "$0")/services/front-edge-service.yaml"
kubectl apply -f "$(dirname "$0")/services/front-qa-service.yaml"
kubectl apply -f "$(dirname "$0")/services/connectors-service.yaml"
kubectl apply -f "$(dirname "$0")/services/connectors-worker-service.yaml"
kubectl apply -f "$(dirname "$0")/services/metabase-service.yaml"
kubectl apply -f "$(dirname "$0")/services/core-service.yaml"
kubectl apply -f "$(dirname "$0")/services/core-sqlite-worker-headless-service.yaml"
kubectl apply -f "$(dirname "$0")/services/oauth-service.yaml"
kubectl apply -f "$(dirname "$0")/services/viz-service.yaml"


echo "-----------------------------------"
echo "Applying ingress"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/ingress.yaml"

echo "-----------------------------------"
echo "Applying network policies"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/network-policies/core-network-policy.yaml"
kubectl apply -f "$(dirname "$0")/network-policies/oauth-network-policy.yaml"
kubectl apply -f "$(dirname "$0")/network-policies/core-sqlite-worker-network-policy.yaml"
