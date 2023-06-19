#!/bin/sh
# first arg : image
# second arg : deployment name
# third arg : container name (default=web)
set -e

kubectl set image deployment/$2 ${3:-web}=$1 && kubectl rollout status deployment/$2 --watch=false  | grep Waiting || kubectl rollout restart deployment/$2
echo "Updated $2 image to: $1"