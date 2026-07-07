// `dsbx db reconcile` runner backend: bring a live pod database in line with its drizzle schema
// file, applying ADDITIVE DDL only (manifest.v1 reconcile contract).
//
// Flow:
//   1. Validate the schema file with the same rejections as `function build` (FK/CHECK/...).
//   2. Pre-reject destructive diffs: any live table/column absent from the desired schema is a
//      typed `destructive_change` error. This also guarantees drizzle-kit's interactive rename
//      resolvers are unreachable (they only prompt when a create and a delete coexist).
//   3. Plan via drizzle-kit's programmatic `pushSQLiteSchema` (dry: it returns the statements
//      without applying), classify every statement against the allowed list, then apply them in
//      ONE transaction with rollback. drizzle-kit's own `apply()` is a bare loop — never used.
//
// The database file is created on first claim (WAL journal mode + pragmas).

import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { DbCommandError, introspectLiveTables } from "./db_common.ts";
import { extractDatabaseManifestFromFile } from "./manifest.ts";

export interface ReconcileSuccess {
  ok: true;
  created: boolean;
  statements: string[];
}

// Reconcile plan classification (manifest.v1): CREATE TABLE, ALTER TABLE ... ADD [COLUMN],
// CREATE [UNIQUE] INDEX, DROP INDEX. Note drizzle-kit push emits `ALTER TABLE x ADD y` without
// the COLUMN keyword. Everything else (DROP TABLE/COLUMN, RENAME, INSERT of a table
// recreate-and-copy, ...) is rejected and nothing is applied.
const ALLOWED_STATEMENT_PATTERNS: RegExp[] = [
  /^CREATE TABLE\s/i,
  /^ALTER TABLE\s+(?:`[^`]+`|"[^"]+"|\S+)\s+ADD\s/i,
  /^CREATE INDEX\s/i,
  /^CREATE UNIQUE INDEX\s/i,
  /^DROP INDEX\s/i,
];

function isAllowedStatement(statement: string): boolean {
  const head = statement.trimStart();
  return ALLOWED_STATEMENT_PATTERNS.some((pattern) => pattern.test(head));
}

export async function reconcile(
  dbPath: string,
  schemaPath: string
): Promise<ReconcileSuccess> {
  // 1. Validate the schema file: same FK/CHECK/composite-PK/empty rejections as build time.
  //    The manifest also gives us the desired shape for the destructive pre-check.
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
  const manifest = manifestResult.value;

  // The schema module's table exports feed drizzle-kit directly; the manifest step above
  // already proved the module imports.
  const schemaModule: Record<string, unknown> = await import(schemaPath);

  // 2. Open (or create on first claim) the live database.
  const created = !existsSync(dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  let succeeded = false;
  try {
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

    // 3. Destructive pre-check: everything live must still exist in the desired schema.
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

    // 4. Plan. drizzle-kit is resolved at runtime (global npm modules via NODE_PATH in the
    //    sandbox, devDependency in tests): it is a publish-time-only engine and inlining it is
    //    not possible (it dynamically imports optional database drivers).
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

    // 5. Classify: additive statements only, or nothing is applied.
    const disallowed = plan.statementsToExecute.filter(
      (statement) => !isAllowedStatement(statement)
    );
    if (disallowed.length > 0) {
      throw new DbCommandError(
        "disallowed_statement",
        `reconcile only applies additive DDL (CREATE TABLE, ADD COLUMN, CREATE [UNIQUE] INDEX, DROP INDEX); ` +
          `refusing: ${disallowed.map((statement) => statement.replace(/\s+/g, " ").trim()).join(" | ")}`
      );
    }

    // 6. Apply in one transaction with rollback.
    if (plan.statementsToExecute.length > 0) {
      sqlite.exec("BEGIN IMMEDIATE;");
      try {
        for (const statement of plan.statementsToExecute) {
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

    succeeded = true;
    return { ok: true, created, statements: plan.statementsToExecute };
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

type PushSQLiteSchema = typeof import("drizzle-kit/api").pushSQLiteSchema;
type DrizzleKitSQLiteDatabase = Parameters<PushSQLiteSchema>[1];

// pushSQLiteSchema's parameter is nominally typed LibSQLDatabase but only `.all(sql)` /
// `.run(sql)` are used, which the bun-sqlite drizzle instance provides with compatible
// signatures (verified in the E2 spike). This shim documents (and confines) the cast.
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
