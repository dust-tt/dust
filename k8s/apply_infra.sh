#!/bin/sh

set -e


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

kubectl apply -f "$(dirname "$0")/configmaps/front-edge-configmap.yaml"

echo "-----------------------------------"
echo "Applying deployments"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/deployments/front-edge-deployment.yaml"


echo "-----------------------------------"
echo "Applying services"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/services/front-edge-service.yaml"


echo "-----------------------------------"
echo "Applying ingress"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/ingress.yaml"

echo "-----------------------------------"
echo "Applying backend configs"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/backend-configs/front-backend-config.yaml"

echo "-----------------------------------"
echo "Applying managed certificates"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/managed-certs/front-edge-managed-cert.yaml"