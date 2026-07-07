// Shared helpers for the `dsbx db` runner subcommands (reconcile/schema/query).
//
// The Rust layer resolves database names to file paths (name validation + DUST_POD_DATABASES_DIR
// resolution) and passes absolute paths here, so these helpers only deal with files.

import { Database } from "bun:sqlite";

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

export class DbCommandError extends Error {
  readonly kind: DbErrorKind;

  constructor(kind: DbErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function errorEnvelope(e: unknown): {
  ok: false;
  error: { kind: DbErrorKind; message: string };
} {
  if (e instanceof DbCommandError) {
    return { ok: false, error: { kind: e.kind, message: e.message } };
  }
  return {
    ok: false,
    error: {
      kind: "internal",
      message: e instanceof Error ? e.message : String(e),
    },
  };
}

// Tables that live in a pod database but are not part of the data model: SQLite internals,
// drizzle bookkeeping, and litestream sequencing tables.
export function isInternalTable(name: string): boolean {
  return (
    name.startsWith("sqlite_") ||
    name.startsWith("__drizzle") ||
    name.startsWith("_litestream")
  );
}

export function openReadonly(dbPath: string): Database {
  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e) {
    throw new DbCommandError(
      "database_not_found",
      `cannot open database at ${dbPath}: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
  db.exec("PRAGMA query_only = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export interface LiveColumn {
  name: string;
  declaredType: string;
  notNull: boolean;
  defaultValue: string | null;
  pkOrdinal: number;
  hidden: number;
}

export interface LiveIndex {
  name: string;
  unique: boolean;
  // "c" = CREATE INDEX, "u" = UNIQUE constraint auto-index, "pk" = PRIMARY KEY auto-index.
  origin: string;
  columns: (string | null)[]; // null for rowid/expression members
}

export interface LiveTable {
  name: string;
  createSql: string;
  columns: LiveColumn[];
  indexes: LiveIndex[];
}

// Introspects the user-facing tables of a live database via sqlite_master + PRAGMAs.
export function introspectLiveTables(db: Database): LiveTable[] {
  const rows = db
    .query(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    .all() as { name: string; sql: string | null }[];

  const tables: LiveTable[] = [];
  for (const row of rows) {
    if (isInternalTable(row.name)) {
      continue;
    }
    const columns = (
      db.query(`PRAGMA table_xinfo(${quoteIdentifier(row.name)})`).all() as {
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
        hidden: number;
      }[]
    ).map((column) => ({
      name: column.name,
      declaredType: column.type,
      notNull: column.notnull !== 0,
      defaultValue: column.dflt_value,
      pkOrdinal: column.pk,
      hidden: column.hidden,
    }));

    const indexes: LiveIndex[] = (
      db.query(`PRAGMA index_list(${quoteIdentifier(row.name)})`).all() as {
        name: string;
        unique: number;
        origin: string;
      }[]
    ).map((index) => {
      const members = db
        .query(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
        .all() as { name: string | null }[];
      return {
        name: index.name,
        unique: index.unique !== 0,
        origin: index.origin,
        columns: members.map((member) => member.name),
      };
    });

    tables.push({
      name: row.name,
      createSql: row.sql ?? "",
      columns,
      indexes,
    });
  }
  return tables;
}

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
