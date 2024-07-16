#!/bin/bash

set -e

function apply_deployment {
    # This function applies a deployment, but if the deployment already exists,
    # it will replace the image with the current image to avoid a rolling update
    DEPLOYMENT_NAME=$1
    YAML_FILE="$(dirname "$0")/deployments/$DEPLOYMENT_NAME.yaml"

    # Get the current image if it exists
    CURRENT_IMAGE=$(kubectl get deployment $DEPLOYMENT_NAME -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)

    if [ -n "$CURRENT_IMAGE" ]; then
        # If CURRENT_IMAGE is not empty, replace the image in the YAML file with the actual image and apply it
        yq e ".spec.template.spec.containers[].image = \"$CURRENT_IMAGE\"" $YAML_FILE | kubectl apply -f -
    else
        # If CURRENT_IMAGE is empty, apply the original YAML
        kubectl apply -f $YAML_FILE
    fi
}

if helm list -n default | grep -q dust-datadog-agent; then
    echo "datadog-agent already installed, skipping."
else
    if [ -z ${DD_API_KEY+x} ]; then
        echo "DD_API_KEY is unset"
        exit 1
    fi

    if [ -z ${DD_APP_KEY+x} ]; then
        echo "DD_APP_KEY is unset"
        exit 1
    fi
    echo "-----------------------------------"
    echo "Installing datadog-agent"
    echo "-----------------------------------"
    helm repo add datadog https://helm.datadoghq.com
    helm repo update
    helm install dust-datadog-agent datadog/datadog -f "$(dirname "$0")/datadog-values.yml" \
        --set datadog.apiKey=$DD_API_KEY \
        --set datadog.appKey=$DD_APP_KEY
fi


echo "-----------------------------------"
echo "Applying configmaps"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/configmaps/apache-tika-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/front-edge-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/connectors-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/connectors-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/connectors-worker-specific-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/alerting-temporal-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/core-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/core-sqlite-worker-configmap.yaml"
kubectl apply -f "$(dirname "$0")/configmaps/prodbox-configmap.yaml"

echo "-----------------------------------"
echo "Applying backend configs"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/backend-configs/apache-tika-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/front-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/connectors-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/metabase-backend-config.yaml"
kubectl apply -f "$(dirname "$0")/backend-configs/core-backend-config.yaml"

echo "-----------------------------------"
echo "Applying managed certificates"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/managed-certs/front-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/front-edge-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/connectors-managed-cert.yaml"
kubectl apply -f "$(dirname "$0")/managed-certs/metabase-managed-cert.yaml"


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
apply_deployment front-edge-deployment
apply_deployment connectors-deployment
apply_deployment connectors-worker-deployment
apply_deployment connectors-worker-notion-deployment
apply_deployment connectors-worker-webcrawler-deployment
apply_deployment connectors-worker-google-drive-deployment
apply_deployment metabase-deployment
apply_deployment alerting-temporal-deployment
apply_deployment core-deployment
apply_deployment core-sqlite-worker-deployment
apply_deployment prodbox-deployment

echo "-----------------------------------"
echo "Applying services"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/services/apache-tika-service.yaml"
kubectl apply -f "$(dirname "$0")/services/front-service.yaml"
kubectl apply -f "$(dirname "$0")/services/front-edge-service.yaml"
kubectl apply -f "$(dirname "$0")/services/connectors-service.yaml"
kubectl apply -f "$(dirname "$0")/services/connectors-worker-service.yaml"
kubectl apply -f "$(dirname "$0")/services/metabase-service.yaml"
kubectl apply -f "$(dirname "$0")/services/core-service.yaml"
kubectl apply -f "$(dirname "$0")/services/core-sqlite-worker-headless-service.yaml"


echo "-----------------------------------"
echo "Applying ingress"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/ingress.yaml"

