---
tags: [lint, security]
level: error
---

# No raw SQL queries

Matches raw SQL query calls on Sequelize instances. Use Sequelize models and methods instead.

```grit
language js

// Note: The Biome plugin also matches `$obj.query<$_>($args)` for TypeScript
// generic calls, but grit CLI does not support generic syntax.
raw_sql_query() => `RAW_SQL_FORBIDDEN`
```

## Should flag frontSequelize.query

```typescript
const result = await frontSequelize.query("SELECT * FROM users");
```

```typescript
const result = await RAW_SQL_FORBIDDEN;
```

## Should flag getFrontReplicaDbConnection query

```typescript
const result = await getFrontReplicaDbConnection().query("SELECT 1");
```

```typescript
const result = await RAW_SQL_FORBIDDEN;
```

## Should flag regex matched sequelize

```typescript
const result = await connectorsSequelize.query("SELECT 1");
```

```typescript
const result = await RAW_SQL_FORBIDDEN;
```

## Should not flag normal method calls

```typescript
const result = await UserModel.findAll({ where: { id: 1 } });
```
