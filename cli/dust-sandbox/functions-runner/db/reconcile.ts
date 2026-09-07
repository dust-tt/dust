// `dsbx db reconcile` runner backend: bring a live sandbox database in line with its drizzle schema
// file, applying ADDITIVE DDL only. Expected refusals come back as Err (ERR1), never thrown.
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
import { chmodSync, closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { Err, Ok, type Result } from "#result.ts";
import type { DatabaseSchema } from "#types/db.ts";
import {
  applyWritePragmas,
  DbCommandError,
  introspectLiveTables,
} from "./common.ts";
import { extractDatabaseSchema } from "./validate.ts";

export interface ReconcileOutcome {
  created: boolean;
  statements: string[];
}

export async function reconcile(
  dbPath: string,
  schemaPath: string
): Promise<Result<ReconcileOutcome, DbCommandError>> {
  const desired = await validateSchemaFile(dbPath, schemaPath);
  if (desired.isErr()) {
    return desired;
  }

  const schemaModule: Record<string, unknown> = await import(schemaPath);

  const created = claimDatabaseFile(dbPath);
  const sqlite = openLiveDatabase(dbPath, created);
  let succeeded = false;
  try {
    const destructive = checkNoDestructiveChanges(sqlite, desired.value);
    if (destructive.isErr()) {
      return destructive;
    }
    const planned = await planStatements(sqlite, schemaModule);
    if (planned.isErr()) {
      return planned;
    }
    const additive = checkAdditiveOnly(planned.value);
    if (additive.isErr()) {
      return additive;
    }
    const applied = applyInTransaction(sqlite, planned.value);
    if (applied.isErr()) {
      return applied;
    }

    succeeded = true;
    return new Ok({ created, statements: planned.value });
  } finally {
    sqlite.close();
    if (created && !succeeded) {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${dbPath}${suffix}`, { force: true });
      }
    }
  }
}

// 1. Validate the schema file: same FK/CHECK/UNIQUE-constraint/PK/empty rejections as build
//    time (shared extractor); schema error kinds map onto db command error kinds.
async function validateSchemaFile(
  dbPath: string,
  schemaPath: string
): Promise<Result<DatabaseSchema, DbCommandError>> {
  const dbName = basename(dbPath, ".db");
  const extracted = await extractDatabaseSchema(dbName, schemaPath, schemaPath);
  if (extracted.isErr()) {
    const kind =
      extracted.error.kind === "database_schema_unresolvable"
        ? "schema_unresolvable"
        : "schema_invalid";
    return new Err(new DbCommandError(kind, extracted.error.message));
  }
  return new Ok(extracted.value);
}

// 2a. Detect + perform the first claim atomically: O_EXCL creation instead of an existsSync
//     probe, so two concurrent reconciles cannot both believe they created the file. The
//     failure-path cleanup above still only removes files this call created.
function claimDatabaseFile(dbPath: string): boolean {
  mkdirSync(dirname(dbPath), { recursive: true });
  try {
    closeSync(openSync(dbPath, "wx"));
    return true;
  } catch {
    // Exists already (or is unreadable — the open below surfaces that as an internal error).
    return false;
  }
}

// 2b. Open the live database read-write (the file exists: claimDatabaseFile ran first).
function openLiveDatabase(dbPath: string, created: boolean): Database {
  const sqlite = new Database(dbPath, { readwrite: true, create: false });
  if (created) {
    // Group-writable so litestream (user dust-state, group agent) can write the file it
    // replicates; SQLite derives the -wal/-shm modes from the database file's mode.
    chmodSync(dbPath, 0o660);
  }
  if (created) {
    sqlite.exec("PRAGMA journal_mode = WAL;");
  }
  applyWritePragmas(sqlite);
  return sqlite;
}

// 3. Destructive pre-check: everything live must still exist in the desired schema.
function checkNoDestructiveChanges(
  sqlite: Database,
  desired: DatabaseSchema
): Result<undefined, DbCommandError> {
  const destructive: string[] = [];
  for (const liveTable of introspectLiveTables(sqlite)) {
    const desiredTable = desired.tables[liveTable.name];
    if (desiredTable === undefined) {
      destructive.push(`table "${liveTable.name}" would be dropped`);
      continue;
    }
    for (const liveColumn of liveTable.columns) {
      // hidden != 0 = generated or expression columns (PRAGMA table_xinfo), which a drizzle
      // schema file never declares — comparing them would flag every one as dropped.
      if (liveColumn.hidden !== 0) {
        continue;
      }
      if (!desiredTable.columns.includes(liveColumn.name)) {
        destructive.push(
          `column "${liveTable.name}"."${liveColumn.name}" would be dropped`
        );
      }
    }
  }
  if (destructive.length > 0) {
    return new Err(
      new DbCommandError(
        "destructive_change",
        `destructive changes are not allowed through reconcile: ${destructive.join("; ")}. ` +
          "Keep existing tables and columns declared in the schema file and evolve additively."
      )
    );
  }
  return new Ok(undefined);
}

// 4. Plan the diff between the live database and the schema module's exported tables.
async function planStatements(
  sqlite: Database,
  schemaModule: Record<string, unknown>
): Promise<Result<string[], DbCommandError>> {
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
  try {
    const plan = await withStdoutSuppressed(async () => {
      const db = drizzle(sqlite);
      return pushSQLiteSchema(imports, asLibSqlDatabase(db));
    });
    return new Ok(plan.statementsToExecute);
  } catch (e) {
    return new Err(
      new DbCommandError(
        "plan_failed",
        `drizzle-kit could not plan the reconcile: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    );
  }
}

// 5. Classify: additive statements only, or nothing is applied.
//
// Allowed: CREATE TABLE, ALTER TABLE ... ADD [COLUMN], CREATE [UNIQUE] INDEX,
// DROP INDEX. Note drizzle-kit push emits `ALTER TABLE x ADD y` without the COLUMN keyword.
// Everything else (DROP TABLE/COLUMN, RENAME, INSERT of a table recreate-and-copy, ...) is
// rejected.
const ALTER_ADD_PATTERN = /^ALTER TABLE\s+(?:`[^`]+`|"[^"]+"|\S+)\s+ADD\s/i;

const ALLOWED_STATEMENT_PATTERNS: RegExp[] = [
  /^CREATE TABLE\s/i,
  ALTER_ADD_PATTERN,
  /^CREATE INDEX\s/i,
  /^CREATE UNIQUE INDEX\s/i,
  /^DROP INDEX\s/i,
];

function checkAdditiveOnly(
  statements: string[]
): Result<undefined, DbCommandError> {
  const disallowed = statements.filter(
    (statement) =>
      !ALLOWED_STATEMENT_PATTERNS.some((pattern) =>
        pattern.test(statement.trimStart())
      )
  );
  if (disallowed.length > 0) {
    return new Err(
      new DbCommandError(
        "disallowed_statement",
        `reconcile only applies additive DDL (CREATE TABLE, ADD COLUMN, CREATE [UNIQUE] INDEX, DROP INDEX); ` +
          `refusing: ${disallowed.map((statement) => statement.replace(/\s+/g, " ").trim()).join(" | ")}`
      )
    );
  }

  // SQLite categorically refuses adding a NOT NULL column without a default to an existing
  // table; refuse it here as a correctable error instead of an opaque apply failure.
  const notNullAdds = statements.filter(
    (statement) =>
      ALTER_ADD_PATTERN.test(statement.trimStart()) &&
      /\bNOT NULL\b/i.test(statement) &&
      !/\bDEFAULT\b/i.test(statement)
  );
  if (notNullAdds.length > 0) {
    return new Err(
      new DbCommandError(
        "disallowed_statement",
        `SQLite cannot add a NOT NULL column without a default to an existing table; make the ` +
          `column nullable or give it a .default(...): ${notNullAdds
            .map((statement) => statement.replace(/\s+/g, " ").trim())
            .join(" | ")}`
      )
    );
  }
  return new Ok(undefined);
}

// 6. Apply in one transaction with rollback.
function applyInTransaction(
  sqlite: Database,
  statements: string[]
): Result<undefined, DbCommandError> {
  if (statements.length === 0) {
    return new Ok(undefined);
  }
  sqlite.exec("BEGIN IMMEDIATE;");
  try {
    for (const statement of statements) {
      sqlite.exec(statement);
    }
    sqlite.exec("COMMIT;");
    return new Ok(undefined);
  } catch (e) {
    sqlite.exec("ROLLBACK;");
    return new Err(
      new DbCommandError(
        "apply_failed",
        `reconcile failed to apply and was rolled back: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    );
  }
}

type PushSQLiteSchema = typeof import("drizzle-kit/api").pushSQLiteSchema;
type DrizzleKitSQLiteDatabase = Parameters<PushSQLiteSchema>[1];

// pushSQLiteSchema's parameter is nominally typed LibSQLDatabase but only `.all(sql)` /
// `.run(sql)` are used, which the bun-sqlite drizzle instance provides with compatible
// signatures (verified in the E2 spike). The mismatch is nominal only, so the compiler
// cannot verify it: the explicit `unknown` hop makes that the one deliberate, confined type
// hole of this file rather than a silent widening.
function asLibSqlDatabase(db: {
  // `never` params: callers pass functions with narrower query types (contravariance).
  all: (query: never) => unknown;
  run: (query: never) => unknown;
}): DrizzleKitSQLiteDatabase {
  return db as unknown as DrizzleKitSQLiteDatabase;
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
