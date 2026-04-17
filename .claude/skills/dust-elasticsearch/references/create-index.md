# Creating a New Index

This reference covers the full create-or-migrate path for a `front` Elasticsearch index, including
document types, mappings, settings, alias registration, index creation, and verification.

## Step 1: Define Your Document Schema

Create a TypeScript interface in `types/` directory:

```typescript
// types/your_feature/your_index.ts
import type { ElasticsearchBaseDocument } from "@/lib/api/elasticsearch";

// ElasticsearchBaseDocument provides: workspace_id (for workspace isolation)
export interface YourIndexData extends ElasticsearchBaseDocument {
  your_entity_id: string; // Your primary identifier

  // Your custom fields
  status: "success" | "failed";
  metadata: {
    field1: string;
    field2: number;
  };

  // Nested arrays if needed
  nested_data: Array<{
    item_id: string;
    value: number;
  }>;

  // It is recommended to store the date at which the document was created/updated. Useful for
  // potential future migrations
  updated_at: Date;
}
```

**Note:** The `workspace_id` field is automatically provided by `ElasticsearchBaseDocument` and
should not be redeclared.

**Example:** See `types/user_search/user_search.ts`.

## Step 2: Create Mappings File

Create `lib/your_feature/indices/your_index_name_1.mappings.json`:

```json
{
  "properties": {
    "workspace_id": {
      "type": "keyword"
    },
    "your_entity_id": {
      "type": "keyword"
    },
    "timestamp": {
      "type": "date"
    },
    "status": {
      "type": "keyword"
    },
    "metadata": {
      "properties": {
        "field1": {
          "type": "keyword"
        },
        "field2": {
          "type": "integer"
        }
      }
    },
    "nested_data": {
      "type": "nested",
      "properties": {
        "item_id": {
          "type": "keyword"
        },
        "value": {
          "type": "integer"
        }
      }
    }
  }
}
```

**Example:** See `lib/user_search/indices`.

**Important Mapping Decisions:**

- Use `keyword` for exact-match fields (IDs, statuses, categories)
- Use `text` for full-text search (but note: can be expensive)
- Use `integer`, `long`, `short` for numeric data
- Use `date` for timestamps
- Use `nested` type when you need to preserve array element relationships
- Use `"index": false` on `text` fields if you want retrievable (to avoid roundtrip to DB) but not
  indexed/searchable content

### Multi-Field Mappings with Custom Analyzers

When you need to search a field in multiple ways (exact match, prefix search, full-text), use
multi-field mappings with the `fields` property:

```json
{
  "properties": {
    "title": {
      "type": "text",
      "analyzer": "standard",
      "fields": {
        "edge": {
          "type": "text",
          "analyzer": "edge_analyzer",
          "search_analyzer": "standard"
        },
        "keyword": {
          "type": "keyword"
        }
      }
    },
    "username": {
      "type": "keyword",
      "normalizer": "custom_normalizer",
      "fields": {
        "text": {
          "type": "text",
          "analyzer": "icu_analyzer"
        }
      }
    }
  }
}
```

**Multi-Field Use Cases:**

- `title` (main field): Full-text search with standard analyzer
- `title.edge`: Prefix/autocomplete search with edge n-grams
- `title.keyword`: Exact match, sorting, aggregations
- `username`: Case-insensitive exact match with normalizer
- `username.text`: Full-text search on username

**Important Note on Email Addresses:**

If you intend to index email addresses, you should use the `uax_url_email` tokenizer, which
ensures that emails are indexed in a way that serves both exact match and autocompletion. Without
it, the email ends up being tokenized into noisy tokens (e.g., `@gmail.com` is tokenized
separately, breaking the email structure). Example:

```json
{
  "properties": {
    "email": {
      "type": "text",
      "analyzer": "email_analyzer",
      "fields": {
        "keyword": {
          "type": "keyword"
        }
      }
    }
  }
}
```

Where `email_analyzer` would be defined in your index settings with:

```json
{
  "analysis": {
    "tokenizer": {
      "uax_url_email_tokenizer": {
        "type": "uax_url_email",
        "filter": ["lowercase", "asciifolding"]
      }
    },
    "analyzer": {
      "uax_analyzer": {
        "type": "custom",
        "tokenizer": "uax_url_email_tokenizer"
      }
    }
  }
}
```

**Example:** See `front/lib/user_search/indices`.

**Querying Multi-Fields:**

```typescript
// Exact match
{ term: { "title.keyword": "Exact Title" } }

// Prefix search (autocomplete) - use match_phrase_prefix with edge n-grams
{ match_phrase_prefix: { "title.edge": "pre" } }

// Full-text search
{ match: { "title": "search terms" } }

// Case-insensitive username
{ term: { "username": "John" } } // matches "john", "JOHN", etc.
```

**Example:** See `core/src/search_stores/indices/data_sources_nodes_4.mappings.json` for
production multi-field examples.

## Step 3: Create Settings Files (Regional)

Create settings files for each region. Settings can include basic index configuration (shards,
replicas, refresh) and optionally custom analyzers/tokenizers for advanced text search.

### Basic Settings (Simple Use Case)

For simple indices without full-text search requirements:

**`lib/your_feature/indices/your_index_name_1.settings.local.json`:**

```json
{
  "number_of_shards": 1,
  "number_of_replicas": 0,
  "refresh_interval": "1s"
}
```

**`lib/your_feature/indices/your_index_name_1.settings.us-central1.json`:**

```json
{
  "number_of_shards": 3,
  "number_of_replicas": 1,
  "refresh_interval": "30s"
}
```

**`lib/your_feature/indices/your_index_name_1.settings.europe-west1.json`:**

```json
{
  "number_of_shards": 3,
  "number_of_replicas": 1,
  "refresh_interval": "30s"
}
```

**Settings Guidelines:**

- **Local:** 1 shard, 0 replicas, fast refresh (1s)
- **Production:** 3 shards, 1 replica, slower refresh (30s for better performance)
- Adjust `number_of_shards` based on expected data volume
- `refresh_interval` controls how often new data becomes searchable (trade-off: freshness vs
  performance)

### Advanced Settings with Custom Analyzers (Search Use Case)

For indices requiring advanced text search (like data source nodes in `core`), include custom
analyzers and tokenizers in the settings:

**`lib/your_feature/indices/your_index_name_1.settings.us-central1.json`:**

```json
{
  "number_of_shards": 2,
  "number_of_replicas": 1,
  "refresh_interval": "5s",
  "analysis": {
    "analyzer": {
      "icu_analyzer": {
        "type": "custom",
        "tokenizer": "icu_tokenizer",
        "filter": [
          "icu_folding",
          "lowercase",
          "asciifolding",
          "preserve_word_delimiter"
        ]
      },
      "edge_analyzer": {
        "type": "custom",
        "tokenizer": "icu_tokenizer",
        "filter": ["lowercase", "edge_ngram_filter"]
      }
    },
    "normalizer": {
      "custom_normalizer": {
        "type": "custom",
        "filter": ["lowercase", "asciifolding"]
      }
    },
    "filter": {
      "preserve_word_delimiter": {
        "type": "word_delimiter",
        "split_on_numerics": false,
        "split_on_case_change": false
      },
      "edge_ngram_filter": {
        "type": "edge_ngram",
        "min_gram": 1,
        "max_gram": 20
      }
    }
  }
}
```

**Key Analyzer Concepts:**

- **Analyzer:** Controls how text is processed for indexing and searching (tokenization + filters)
- **Tokenizer:** Breaks text into tokens (e.g., `icu_tokenizer` for Unicode-aware tokenization)
- **Filters:** Transform tokens (e.g., `lowercase`, `asciifolding`, `edge_ngram`)
- **Normalizer:** Like analyzer but for keyword fields (doesn't tokenize, only applies filters)

**Common Analyzers:**

- `standard`: Default analyzer, basic tokenization
- `icu_analyzer`: Unicode-aware, handles international text, applies case/accent folding
- `edge_analyzer`: For prefix/autocomplete search using edge n-grams

**Common Filters:**

- `lowercase`: Converts to lowercase
- `asciifolding`: Converts accented characters to ASCII (`e` -> `e`)
- `icu_folding`: Unicode case/accent folding
- `word_delimiter`: Splits on word boundaries (`camelCase`, `snake_case`)
- `edge_ngram`: Creates prefix tokens for autocomplete

**Reference:** See `core/src/search_stores/indices/data_sources_nodes_4.settings.*.json` for
production examples.

## Step 4: Create Index Constant

Add to `lib/api/elasticsearch.ts`:

```typescript
export const YOUR_INDEX_ALIAS_NAME = "front.your_index_name";

export const INDEX_DIRECTORIES: Record<string, string> = {
  ...
  your_index_name: "lib/your_feature/indices",
  ...
};
```

## Step 5: Run Index Creation Script

```bash
tsx front/scripts/create_elasticsearch_index.ts \
  --index-name your_index_name \
  --index-version 1 \
  --skip-confirmation
```

**What this script does (from `scripts/create_elasticsearch_index.ts:1-201`):**

1. Reads settings from `lib/*/indices/your_index_name_1.settings.{region}.json`
2. Reads mappings from `lib/*/indices/your_index_name_1.mappings.json`
3. Creates index named: `front.your_index_name_1`
4. Creates alias: `front.your_index_name` pointing to `front.your_index_name_1` with
   `is_write_index: true`

**Optional Flags:**

- `--skip-confirmation` - Skip confirmation prompts
- `--remove-previous-alias` - Remove alias from previous version (use when migrating)

## Step 6: Verify Index Creation

```bash
# Check index exists
curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
  "$ELASTICSEARCH_URL/front.your_index_name_1"

# Check alias
curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
  "$ELASTICSEARCH_URL/_alias/front.your_index_name"
```
