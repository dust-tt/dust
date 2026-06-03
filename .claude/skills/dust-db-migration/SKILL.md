---
name: dust-db-migration
description: Step-by-step guide for creating and running SQL schema migrations in `front` or `connectors` using the `npm run migration:*` tooling (pg-schema-diff + Umzug). Use when adding or removing columns, tables, or indexes that require a coordinated deploy.
---

# DB Migrations (front / connectors)

Use this skill whenever a code change requires a schema change. The tooling auto-generates SQL by
diffing your local Sequelize models against the running database, so you should **update the model/
first**, then generate the migration.

## The Two Phases

Every migration belongs to one of two phases. Picking the wrong one will either block the deploy
or break old code:

| Phase         | Run                           | Examples                                                                    |
|---------------|-------------------------------|-----------------------------------------------------------------------------|
| `pre-deploy`  | **before** new code goes live | `ADD COLUMN` (nullable), `CREATE TABLE`, `CREATE INDEX CONCURRENTLY`        |
| `post-deploy` | **after** new code is live    | `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN … NOT NULL`, tighten constraints |

> Down migrations are **not supported**. Rolling back a schema change means a new forward migration
> (expand/contract pattern).

## Prerequisites

These must be available before running any migration command:

- `pg-schema-diff` — `brew install pg-schema-diff`
- `psql` — `brew install postgresql`
- For `front`: `FRONT_DATABASE_URI` env var set
- For `connectors`: `CONNECTORS_DATABASE_URI` env var set (local default:
  `postgres://dev:dev@localhost:5432/dust_connectors`)

## Step-by-step

### 1. Update the Sequelize model

Edit the model file in the appropriate location and reflect the desired end state. The generator
derives the migration SQL from the model, not from hand-written SQL.

- `front`: `front/lib/models/`
- `connectors`: `connectors/src/lib/models/`

### 2. Generate the migration SQL

Run from inside `front/` or `connectors/`:

```bash
# Pre-deploy (add column, add table, add index)
npm run migration:generate:pre-deploy -- add_column_to_users

# Post-deploy (drop column, tighten constraint)
npm run migration:generate:post-deploy -- drop_legacy_column_from_users
```

The description words are joined with `_`. The script will:

1. Spin up a shadow DB, apply the current branch's models to it
2. Run `pg-schema-diff plan` to compare live DB → shadow
3. Write the SQL to `migrations/pre-deploy/<timestamp>_<desc>.sql` or `migrations/post-deploy/…`

If the output says "No schema changes detected", the model and live DB are already in sync —
double-check you saved the model file.

### 3. Review the generated SQL

Open the generated file and verify the SQL looks right. For index additions, confirm
`CREATE INDEX CONCURRENTLY` is used (pg-schema-diff emits this automatically for large tables).

### 4. Apply locally

```bash
# Apply pre-deploy migrations only
npm run migration:apply:pre-deploy

# Apply post-deploy migrations only
npm run migration:apply:post-deploy

# Apply both in sequence
npm run migration:apply
```

Applied migrations are recorded in the `schema_migrations` table so they won't re-run.

### 5. Check status

```bash
npm run migration:status
```

Lists pending (unapplied) migrations for both phases.

## File Locations

|                      | `front`                                                         | `connectors`                                                              |
|----------------------|-----------------------------------------------------------------|---------------------------------------------------------------------------|
| Generated migrations | `front/migrations/pre-deploy/`, `front/migrations/post-deploy/` | `connectors/migrations/pre-deploy/`, `connectors/migrations/post-deploy/` |
| Migration runner     | `front/scripts/migrate.ts` (via `run-migrate.cjs`)              | `connectors/scripts/migrate.ts` (via `run-migrate.cjs`)                   |
| Generator script     | `front/scripts/generate-migration.sh`                           | `connectors/scripts/generate-migration.sh`                                |
| DB env var           | `FRONT_DATABASE_URI`                                            | `CONNECTORS_DATABASE_URI`                                                 |

- Applied migration ledger: `schema_migrations` table (columns: `name`, `phase`, `applied_at`)

## Key Implementation Details

- The runner uses **Umzug** with a custom `PhasedSequelizeStorage` that namespaces entries by phase
  (`pre-deploy/<filename>` vs `post-deploy/<filename>`), so same-named files in both phases never
  collide.
- Migrations are applied via `psql -f <file>` (not a library client) so that
  `CREATE INDEX CONCURRENTLY` and `SET SESSION` commands work correctly through pgbouncer's
  transaction-pooling mode.
- There is no `down` / rollback support. A `unlogMigration` call throws by design.
