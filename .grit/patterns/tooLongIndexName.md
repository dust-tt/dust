---
tags: [lint, database]
level: info
---

# Too long index name

Validates Sequelize model index names don't exceed PostgreSQL's 63-char limit.
Flags models whose name is >= 40 chars where auto-generated index names are likely too long.

```grit
language js

too_long_index_name() => `TOO_LONG_MODEL_NAME_FLAGGED`
```

## Should flag model with very long name

```typescript
Model.init(
  {},
  {
    modelName: "this_is_a_very_long_model_name_that_exceeds_forty_chars",
    indexes: [{ fields: ["field1", "field2"] }],
  }
);
```

```typescript
Model.init(
  {},
  {
    TOO_LONG_MODEL_NAME_FLAGGED,
    indexes: [{ fields: ["field1", "field2"] }],
  }
);
```

## Should not flag model with short name

```typescript
Model.init(
  {},
  {
    modelName: "short_model",
    indexes: [{ fields: ["field1"] }],
  }
);
```
