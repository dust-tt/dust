#!/bin/bash

# Usage: ./export_node_ids.sh <data_source_id> [output_file]
# Example: ./export_node_ids.sh "my_data_source_123" "node_ids.txt"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <data_source_id> [output_file]"
    exit 1
fi

DATA_SOURCE_ID="$1"
OUTPUT_FILE="${2:-node_ids_${DATA_SOURCE_ID}.txt}"
ES_URL="${ELASTICSEARCH_URL}"
ES_USER="${ELASTICSEARCH_USERNAME}"
ES_PASS="${ELASTICSEARCH_PASSWORD}"

echo "Exporting node_ids for data_source_id: $DATA_SOURCE_ID"
echo "Output file: $OUTPUT_FILE"

# Clear the output file
> "$OUTPUT_FILE"

# Initial search with scroll (with -k flag for self-signed certificates)
SCROLL_ID=$(curl -sk -u "$ES_USER:$ES_PASS" -X POST "$ES_URL/core.data_sources_nodes/_search?scroll=1m" \
  -H 'Content-Type: application/json' \
  -d "{
    \"size\": 1000,
    \"query\": {
      \"term\": {
        \"data_source_id\": \"$DATA_SOURCE_ID\"
      }
    },
    \"_source\": [\"node_id\"]
  }" | tee /tmp/es_response.json | jq -r '._scroll_id')

# Extract node_ids from first batch
jq -r '.hits.hits[]._source.node_id' /tmp/es_response.json >> "$OUTPUT_FILE"

# Get total hits
TOTAL=$(jq -r '.hits.total.value' /tmp/es_response.json)
echo "Total documents found: $TOTAL"

# Continue scrolling until no more results
PROCESSED=$(jq -r '.hits.hits | length' /tmp/es_response.json)

while [ "$PROCESSED" -gt 0 ]; do
    # Fetch next batch
    curl -sk -u "$ES_USER:$ES_PASS" -X POST "$ES_URL/_search/scroll" \
      -H 'Content-Type: application/json' \
      -d "{
        \"scroll\": \"1m\",
        \"scroll_id\": \"$SCROLL_ID\"
      }" > /tmp/es_response.json
    
    # Extract node_ids
    BATCH_SIZE=$(jq -r '.hits.hits | length' /tmp/es_response.json)
    
    if [ "$BATCH_SIZE" -eq 0 ]; then
        break
    fi
    
    jq -r '.hits.hits[]._source.node_id' /tmp/es_response.json >> "$OUTPUT_FILE"
    PROCESSED=$((PROCESSED + BATCH_SIZE))
    echo "Processed $PROCESSED / $TOTAL documents"
done

# Clean up scroll context
curl -sk -u "$ES_USER:$ES_PASS" -X DELETE "$ES_URL/_search/scroll" \
  -H 'Content-Type: application/json' \
  -d "{\"scroll_id\": \"$SCROLL_ID\"}" > /dev/null

# Clean up temp file
rm -f /tmp/es_response.json

echo "Export complete! $(wc -l < "$OUTPUT_FILE") node_ids written to $OUTPUT_FILE"
