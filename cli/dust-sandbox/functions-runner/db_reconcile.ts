// `dsbx db reconcile` runner backend: bring a live pod database in line with its drizzle schema
// file, applying ADDITIVE DDL only (manifest.v1 reconcile contract).
//
// `reconcile` orchestrates one numbered helper per step:
//   1. Validate the schema file with the same rejections as `function build` (FK/CHECK/...).
//   2. Open (or create on first claim) the live database (WAL journal mode + pragmas).
//   3. Pre-reject destructive diffs: any live table/column absent from the desired schema is a
//      typed `destructive_change` error. This also guarantees drizzle-kit's interactive rename
//      resolvers are unreachable (they only prompt when a create and a delete coexist).
//   4. Plan via drizzle-kit's programmatic `pushSQLiteSchema` (dry: it returns the statements
//      without applying).
//   5. Classify every statement against the allowed list.
//   6. Apply them in ONE transaction with rollback. drizzle-kit's own `apply()` is a bare
//      loop — never used.

import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { DbCommandError, introspectLiveTables } from "./db_common.ts";
import {
  type DatabaseManifest,
  extractDatabaseManifestFromFile,
} from "./manifest.ts";

export interface ReconcileSuccess {
  ok: true;
  created: boolean;
  statements: string[];
}

export async function reconcile(
  dbPath: string,
  schemaPath: string
): Promise<ReconcileSuccess> {
  // 1. The manifest also gives us the desired shape for the destructive pre-check.
  const manifest = await validateSchemaFile(dbPath, schemaPath);

  // The schema module's table exports feed drizzle-kit directly; validation above already
  // proved the module imports. Dynamic import is required: schemaPath is a caller-provided
  // runtime path to a model-authored file, so no static specifier can exist for it.
  const schemaModule: Record<string, unknown> = await import(schemaPath);

  // 2.
  const created = !existsSync(dbPath);
  const sqlite = openLiveDatabase(dbPath, created);
  let succeeded = false;
  try {
    // 3.
    assertNoDestructiveChanges(sqlite, manifest);
    // 4.
    const statements = await planStatements(sqlite, schemaModule);
    // 5.
    assertAdditiveOnly(statements);
    // 6.
    applyInTransaction(sqlite, statements);

    succeeded = true;
    return { ok: true, created, statements };
  } finally {
    sqlite.close();
    // A refused/failed reconcile on a FIRST claim must not leave an empty {db}.db behind:
    // @dust/pod's db() opens must-exist, and an empty file is a silently valid database.
    if (created && !succeeded) {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${dbPath}${suffix}`, { force: true });
      }
    }
  }
}

// 1. Validate the schema file: same FK/CHECK/UNIQUE-constraint/composite-PK/empty rejections
//    as build time (shared extractor); manifest error kinds map onto db command error kinds.
async function validateSchemaFile(
  dbPath: string,
  schemaPath: string
): Promise<DatabaseManifest> {
  const dbName = basename(dbPath, ".db");
  const manifestResult = await extractDatabaseManifestFromFile(
    dbName,
    schemaPath,
    schemaPath
  );
  if (!manifestResult.ok) {
    const kind =
      manifestResult.error.kind === "database_schema_unresolvable"
        ? "schema_unresolvable"
        : "schema_invalid";
    throw new DbCommandError(kind, manifestResult.error.message);
  }
  return manifestResult.value;
}

// 2. Open the live database read-write, creating it on first claim.
function openLiveDatabase(dbPath: string, created: boolean): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  if (created) {
    // Group-writable per the paths-env.v1 contract: litestream (user dust-state, group
    // agent) must be able to write the file it replicates — and SQLite derives the -wal/-shm
    // modes from the database file's mode.
    chmodSync(dbPath, 0o660);
  }
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  if (created) {
    sqlite.exec("PRAGMA journal_mode = WAL;");
  }
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  return sqlite;
}

// 3. Destructive pre-check: everything live must still exist in the desired schema.
function assertNoDestructiveChanges(
  sqlite: Database,
  manifest: DatabaseManifest
): void {
  const destructive: string[] = [];
  for (const liveTable of introspectLiveTables(sqlite)) {
    const desiredTable = manifest.tables[liveTable.name];
    if (desiredTable === undefined) {
      destructive.push(`table "${liveTable.name}" would be dropped`);
      continue;
    }
    for (const liveColumn of liveTable.columns) {
      if (liveColumn.hidden !== 0) {
        continue;
      }
      if (desiredTable.columns[liveColumn.name] === undefined) {
        destructive.push(
          `column "${liveTable.name}"."${liveColumn.name}" would be dropped`
        );
      }
    }
  }
  if (destructive.length > 0) {
    throw new DbCommandError(
      "destructive_change",
      `destructive changes are not allowed through reconcile: ${destructive.join("; ")}. ` +
        "Keep existing tables and columns declared in the schema file and evolve additively."
    );
  }
}

// 4. Plan the diff between the live database and the schema module's exported tables.
async function planStatements(
  sqlite: Database,
  schemaModule: Record<string, unknown>
): Promise<string[]> {
  // drizzle-kit is resolved at runtime (global npm modules via NODE_PATH in the sandbox,
  // devDependency in tests): it is a publish-time-only engine and inlining it is not
  // possible (it dynamically imports optional database drivers).
  const { pushSQLiteSchema } = await import("drizzle-kit/api");

  const declaredTables = Object.values(schemaModule).filter((value) =>
    is(value, SQLiteTable)
  );
  const imports: Record<string, unknown> = {};
  declaredTables.forEach((table, i) => {
    imports[`table_${i}`] = table;
  });

  // drizzle-kit renders a progress spinner on stdout; capture and drop it so stdout stays a
  // single JSON envelope (the dsbx wire contract).
  const plan = await withStdoutSuppressed(async () => {
    const db = drizzle(sqlite);
    return pushSQLiteSchema(imports, asLibSqlDatabase(db));
  }).catch((e: unknown) => {
    throw new DbCommandError(
      "plan_failed",
      `drizzle-kit could not plan the reconcile: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  });
  return plan.statementsToExecute;
}

// 5. Classify: additive statements only, or nothing is applied.
//
// Allowed (manifest.v1): CREATE TABLE, ALTER TABLE ... ADD [COLUMN], CREATE [UNIQUE] INDEX,
// DROP INDEX. Note drizzle-kit push emits `ALTER TABLE x ADD y` without the COLUMN keyword.
// Everything else (DROP TABLE/COLUMN, RENAME, INSERT of a table recreate-and-copy, ...) is
// rejected.
const ALLOWED_STATEMENT_PATTERNS: RegExp[] = [
  /^CREATE TABLE\s/i,
  /^ALTER TABLE\s+(?:`[^`]+`|"[^"]+"|\S+)\s+ADD\s/i,
  /^CREATE INDEX\s/i,
  /^CREATE UNIQUE INDEX\s/i,
  /^DROP INDEX\s/i,
];

function assertAdditiveOnly(statements: string[]): void {
  const disallowed = statements.filter(
    (statement) =>
      !ALLOWED_STATEMENT_PATTERNS.some((pattern) =>
        pattern.test(statement.trimStart())
      )
  );
  if (disallowed.length > 0) {
    throw new DbCommandError(
      "disallowed_statement",
      `reconcile only applies additive DDL (CREATE TABLE, ADD COLUMN, CREATE [UNIQUE] INDEX, DROP INDEX); ` +
        `refusing: ${disallowed.map((statement) => statement.replace(/\s+/g, " ").trim()).join(" | ")}`
    );
  }
}

// 6. Apply in one transaction with rollback.
function applyInTransaction(sqlite: Database, statements: string[]): void {
  if (statements.length === 0) {
    return;
  }
  sqlite.exec("BEGIN IMMEDIATE;");
  try {
    for (const statement of statements) {
      sqlite.exec(statement);
    }
    sqlite.exec("COMMIT;");
  } catch (e) {
    sqlite.exec("ROLLBACK;");
    throw new DbCommandError(
      "apply_failed",
      `reconcile failed to apply and was rolled back: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

type PushSQLiteSchema = typeof import("drizzle-kit/api").pushSQLiteSchema;
type DrizzleKitSQLiteDatabase = Parameters<PushSQLiteSchema>[1];

// pushSQLiteSchema's parameter is nominally typed LibSQLDatabase but only `.all(sql)` /
// `.run(sql)` are used, which the bun-sqlite drizzle instance provides with compatible
// signatures (verified in the E2 spike). This shim documents (and confines) the cast — the
// one deliberate type hole of this file.
function asLibSqlDatabase(db: {
  // `never` params: callers pass functions with narrower query types (contravariance).
  all: (query: never) => unknown;
  run: (query: never) => unknown;
}): DrizzleKitSQLiteDatabase {
  return db as DrizzleKitSQLiteDatabase;
}

async function withStdoutSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
}
