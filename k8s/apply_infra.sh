#!/bin/sh

set -e

if [ "$1" == "--install-helm-charts" ]; then
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
fi


echo "-----------------------------------"
echo "Applying configmaps"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/configmaps/front-configmap.yaml"

echo "-----------------------------------"
echo "Applying deployments"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/deployments/front-deployment.yaml"


echo "-----------------------------------"
echo "Applying services"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/services/front-service.yaml"


echo "-----------------------------------"
echo "Applying ingress"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/ingress.yaml"

echo "-----------------------------------"
echo "Applying backend configs"
echo "-----------------------------------"

kubectl apply -f "$(dirname "$0")/backend-configs/front-backend-config.yaml"