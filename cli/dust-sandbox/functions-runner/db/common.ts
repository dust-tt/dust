// Shared helpers for the `dsbx db` runner subcommands (reconcile/schema/query).
//
// The Rust layer resolves database names under the configured databases directory and passes
// absolute paths here, so these helpers only deal with files.

import { Database } from "bun:sqlite";
import { Err, Ok, type Result } from "#result.ts";
import {
  type DbErrorKind,
  type LiveIndex,
  type LiveTable,
  RESERVED_TABLE_PREFIXES,
} from "#types/db.ts";

// Wait up to 5s for a writer's lock instead of failing immediately with SQLITE_BUSY
// (function writes and litestream checkpoints hold short write locks):
// https://sqlite.org/pragma.html#pragma_busy_timeout
export const DB_BUSY_TIMEOUT_MS = 5000;

export class DbCommandError extends Error {
  readonly kind: DbErrorKind;

  constructor(kind: DbErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

// Serializes a db command error (the Err branch of a Result) to the wire envelope.
export function errorEnvelope(error: DbCommandError): {
  ok: false;
  error: { kind: DbErrorKind; message: string };
} {
  return { ok: false, error: { kind: error.kind, message: error.message } };
}

// Tables that live in a sandbox database but are not part of the data model: the same reserved
// prefixes build rejects for declared tables (SQLite internals, drizzle bookkeeping,
// litestream sequencing, plus prefixes drizzle-kit's introspection ignores).
export function isInternalTable(name: string): boolean {
  return RESERVED_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function openReadonly(
  dbPath: string,
  { safeIntegers = false }: { safeIntegers?: boolean } = {}
): Result<Database, DbCommandError> {
  let db: Database;
  try {
    // safeIntegers reads INTEGER columns as bigint instead of a possibly-lossy JS number
    // (SQLite integers are 64-bit, JS numbers are exact only to 2^53):
    // https://bun.com/docs/api/sqlite#datatypes
    db = new Database(dbPath, { readonly: true, safeIntegers });
  } catch (e) {
    return new Err(
      new DbCommandError(
        "database_not_found",
        `cannot open database at ${dbPath}: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    );
  }
  // Second write barrier on top of the readonly open: any statement that changes the
  // database fails with SQLITE_READONLY: https://sqlite.org/pragma.html#pragma_query_only
  db.exec("PRAGMA query_only = ON;");
  db.exec(`PRAGMA busy_timeout = ${DB_BUSY_TIMEOUT_MS};`);
  return new Ok(db);
}

// Pragmas every write connection needs to coexist with litestream; @dust/pod sets the same ones.
export function applyWritePragmas(db: Database): void {
  db.exec(`PRAGMA busy_timeout = ${DB_BUSY_TIMEOUT_MS};`);
  // Litestream is the only checkpointer; a self-checkpoint can make it miss frames.
  db.exec("PRAGMA wal_autocheckpoint = 0;");
  db.exec("PRAGMA synchronous = NORMAL;");
}

export const SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV =
  "DUST_SANDBOX_DATABASE_MAX_SIZE_BYTES";
export const LEGACY_POD_DATABASE_MAX_SIZE_BYTES_ENV =
  "DUST_POD_DATABASE_MAX_SIZE_BYTES";

// The per-database size quota shared with the workload runtime.
export function sandboxDatabaseMaxSizeBytes(): Result<number, DbCommandError> {
  const canonicalValue = process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV];
  const legacyValue = process.env[LEGACY_POD_DATABASE_MAX_SIZE_BYTES_ENV];
  const [envName, raw] =
    canonicalValue !== undefined
      ? [SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV, canonicalValue]
      : legacyValue !== undefined
        ? [LEGACY_POD_DATABASE_MAX_SIZE_BYTES_ENV, legacyValue]
        : [SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV, canonicalValue];
  const parsed =
    raw !== undefined && /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return new Err(
      new DbCommandError(
        "internal",
        `${envName} must be a positive integer byte count; got ${JSON.stringify(raw)}`
      )
    );
  }
  return new Ok(parsed);
}

// Introspects the user-facing tables of a live database via sqlite_master + PRAGMAs.
export function introspectLiveTables(db: Database): LiveTable[] {
  const rows = db
    .query<{ name: string; sql: string | null }, []>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    .all();

  const tables: LiveTable[] = [];
  for (const row of rows) {
    if (isInternalTable(row.name)) {
      continue;
    }
    const columns = db
      .query<
        {
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
          hidden: number;
        },
        []
      >(`PRAGMA table_xinfo(${quoteIdentifier(row.name)})`)
      .all()
      .map((column) => ({
        name: column.name,
        declaredType: column.type,
        notNull: column.notnull !== 0,
        defaultValue: column.dflt_value,
        pkOrdinal: column.pk,
        hidden: column.hidden,
      }));

    const indexes: LiveIndex[] = db
      .query<
        {
          name: string;
          unique: number;
          origin: "c" | "u" | "pk";
          partial: number;
        },
        []
      >(`PRAGMA index_list(${quoteIdentifier(row.name)})`)
      .all()
      .map((index) => {
        const members = db
          .query<{ name: string | null }, []>(
            `PRAGMA index_info(${quoteIdentifier(index.name)})`
          )
          .all();
        return {
          name: index.name,
          unique: index.unique !== 0,
          origin: index.origin,
          partial: index.partial !== 0,
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
