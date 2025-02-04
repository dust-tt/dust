#!/bin/bash
# Runs a single command on the Elasticsearch cluster
if [ $# -ne 1 ]; then
    echo "Usage: $0 <mapping_file>"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Error: File $1 not found"
    exit 1
fi

# Extract method and path from first line
read -r ES_METHOD ES_PATH < "$1"
# Get JSON body (skip first line)
ES_BODY=$(sed '1d' "$1")

# Validate JSON
if ! echo "$ES_BODY" | jq . >/dev/null 2>&1; then
    echo "Error: Invalid JSON body"
    exit 1
fi

read -p "Run command from file ${1} in region ${DUST_REGION}? [y/N] " response
if [[ ! $response =~ ^[Yy]$ ]]; then
    echo "Operation cancelled"
    exit 0
fi

curl -X "$ES_METHOD" "${ELASTICSEARCH_URL}/${ES_PATH}" \
  -H "Content-Type: application/json" \
  -u "${ELASTICSEARCH_USERNAME}:${ELASTICSEARCH_PASSWORD}" \
  -d "$ES_BODY"