#!/bin/sh

gcloud compute ssl-policies create dust-front-ssl-policy \
  --profile MODERN \
  --min-tls-version 1.2
