#!/bin/sh

set -e

gcloud builds submit --config cloudbuild-base.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) .
gcloud builds submit --config cloudbuild-web.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) .
gcloud builds submit --config cloudbuild-worker.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) .
