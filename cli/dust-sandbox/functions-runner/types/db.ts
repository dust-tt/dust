// Pod database wire/type contract: the single authored definition.
//
// This file must stay dependency-free (no imports): front type-imports the error kinds
// (front/lib/api/sandbox_functions/build_on_sandbox.ts, dsbx_db.ts) and mirrors
// DB_NAME_REGEX, equality-checked in front tests (front never bundles cli code). The
// extracted schema shapes are runner-internal: validation plus reconcile's destructive
// pre-check read table and column names, nothing more — no shape is stored or diffed.

export const DB_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Model-authored names become plain-object keys everywhere the shape travels (runner +
// front); these keys would collide with Object.prototype machinery.
export const RESERVED_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Table-name prefixes drizzle-kit's introspection ignores (plus SQLite internals): a table
// named this way would pass build and first reconcile, then be invisible to every subsequent
// reconcile plan — build rejects them up front, and live introspection skips them.
export const RESERVED_TABLE_PREFIXES = [
  "sqlite_",
  "__drizzle",
  "_litestream",
  "_cf_",
  "libsql_",
];

export type DatabaseSchemaErrorKind =
  | "databases_declaration_invalid"
  | "database_schema_unresolvable"
  | "database_schema_invalid";

// Wire kinds of the `dsbx db` command error envelopes (db_common.ts's DbCommandError).
// Front type-imports this union to classify model-correctable kinds.
export type DbErrorKind =
  | "bad_args"
  | "database_not_found"
  | "schema_unresolvable"
  | "schema_invalid"
  | "destructive_change"
  | "disallowed_statement"
  | "plan_failed"
  | "apply_failed"
  | "empty_sql"
  | "query_failed"
  // Unexpected non-DbCommandError failures (infrastructure, bugs) — front must NOT treat
  // these as model-correctable.
  | "internal";

export interface DatabaseTable {
  // Column names only: reconcile's destructive pre-check needs presence, nothing needs shape.
  columns: string[];
}

export interface DatabaseSchema {
  tables: Record<string, DatabaseTable>;
}
