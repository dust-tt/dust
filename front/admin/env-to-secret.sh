#!/bin/bash

secret_name="front-secrets"
env_file=$1

kubectl delete secret $secret_name || true
kubectl create secret generic $secret_name

while IFS= read -r line
do
  [[ -z $line || ${line:0:1} == "#" ]] && continue
  if [[ $line == *"="* ]]; then
    key=$(echo $line | cut -d '=' -f 1)
    value=$(echo $line | cut -d '=' -f 2-)
    kubectl patch secret $secret_name -p '{"stringData":{"'$key'":"'$value'"}}'
  else
    echo "Invalid line in environment file: $line"
    exit 1
  fi
done < "$env_file"
