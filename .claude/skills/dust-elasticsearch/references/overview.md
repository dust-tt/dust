# Elasticsearch Overview

This reference covers environment prerequisites and operational setup details for Elasticsearch work
in `front`.

## Prerequisites

### Required Environment Variables

```bash
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com:9200
ELASTICSEARCH_USERNAME=your-username
ELASTICSEARCH_PASSWORD=your-password
REGION=local  # or us-central1, europe-west1
```

These are configured in `lib/api/config.ts:316-326`.

### Required Dependencies

```json
{
  "@elastic/elasticsearch": "^8.15.0"
}
```

### Elasticsearch Plugins (for Advanced Text Search)

If using custom analyzers with ICU tokenization:

- **ICU Analysis Plugin:** Required for `icu_tokenizer`, `icu_folding`, and Unicode-aware text
  processing
- **Installation:** Usually pre-installed on managed Elasticsearch services
- **Verify:** Check if ICU plugin is installed with:

  ```bash
  # Check installed plugins
  curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
    "$ELASTICSEARCH_URL/_cat/plugins?v"

  # Or test ICU analyzer availability
  curl -XPOST -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
    "$ELASTICSEARCH_URL/_analyze" \
    -H "Content-Type: application/json" \
    -d '{"tokenizer": "icu_tokenizer", "text": "test"}'
  ```

**Note:** Simple analytics indices do not require any plugins.

Simple analytics indices do not need anything else from this file. If you are deciding how the Dust
index architecture is structured, use `SKILL.md` directly.
