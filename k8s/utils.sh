#!/bin/bash

set -e


function check_context {
    CLUSTER_NAME=$1

    # Check if we are in a context that ends with the cluster name to avoid applying to the wrong cluster
    if [[ $(kubectl config current-context) != *"$CLUSTER_NAME" ]]; then
        echo "You are not in the correct context. Please switch to the context that ends with $CLUSTER_NAME"
        exit 1
    fi
}

function apply_deployment {
    # This function applies a deployment, but if the deployment already exists,
    # it will replace the image with the current image to avoid a rolling update
    DEPLOYMENT_NAME=$1
    YAML_FILE="$(dirname "$0")/deployments/$DEPLOYMENT_NAME.yaml"

    # Get the current image if it exists
    CURRENT_IMAGE=$(kubectl get deployment $DEPLOYMENT_NAME -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)

    # Get the current number of replicas if it exists
    CURRENT_REPLICAS=$(kubectl get deployment $DEPLOYMENT_NAME -o jsonpath='{.spec.replicas}' 2>/dev/null || true)

    # Check if an HPA exists for the deployment
    HPA_EXISTS=$(kubectl get hpa $DEPLOYMENT_NAME -o name 2>/dev/null || true)

    if [ -n "$CURRENT_IMAGE" ]; then
         # If CURRENT_IMAGE is not empty, replace the image in the YAML file with the actual image
        UPDATED_YAML=$(yq e ".spec.template.spec.containers[].image = \"$CURRENT_IMAGE\"" $YAML_FILE)

       # If the HPA exists, update the replicas in the YAML
        if [ -n "$HPA_EXISTS" ]; then
            if [ -n "$CURRENT_REPLICAS" ]; then
                UPDATED_YAML=$(echo "$UPDATED_YAML" | yq e ".spec.replicas = $CURRENT_REPLICAS" -)
            fi
        fi

        # Apply the updated YAML
        echo "$UPDATED_YAML" | kubectl apply -f -
    else
        # If CURRENT_IMAGE is empty, apply the original YAML
        kubectl apply -f $YAML_FILE
    fi
}

function install_datadog_agent {
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

}