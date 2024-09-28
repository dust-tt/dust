#!/bin/bash

set -e

# array of our clusters
clusters=("dust-kube" "dust-kube-private")

# loop through each cluster, get-credentials and then apply the infra
for cluster in "${clusters[@]}"
do
    # get the credentials for the cluster
    gcloud container clusters get-credentials $cluster --region us-central1

    # parse the kubectl config get-contexts -o=name to get the context name by matching the cluster name up to line end
    kubectl config use-context $(kubectl config get-contexts -o=name | grep $cluster'$')

    # apply the infra
    $cluster/apply_infra_$cluster.sh
done