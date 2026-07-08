import type { Changes, SQLQueryBindings, Statement } from "bun:sqlite";
import { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

/**
 * Pod state databases.
 *
 * `db(name)` returns a cached Drizzle instance over the pod's live SQLite
 * database at `${DUST_POD_DATABASES_DIR}/{name}.db`. Databases are created by
 * the publish pipeline (`dsbx db reconcile`), never here: the file is opened
 * must-exist so a typo'd name errors clearly instead of minting an empty
 * database. Functions that never call `db()` pay nothing.
 *
 * Disk guardrails — pod state must not fill the sandbox disk by accident:
 *
 * - `db()` cannot create database files (must-exist open), so the set of
 *   databases is fixed at publish time. Total pod-state footprint is the
 *   number of declared databases times the per-database cap; bounding the
 *   count is the publish pipeline's job.
 * - Each database is capped at {@link DEFAULT_POD_DATABASE_MAX_SIZE_BYTES}
 *   (1 GiB) via `PRAGMA max_page_count`. Writes past the cap fail with
 *   {@link PodDatabaseFullError}; the database stays readable and rows can
 *   still be deleted, so the agent recovers in place by reclaiming space.
 * - The cap override env var is clamped down-only, since it is readable and
 *   writable by the workload itself (see
 *   {@link POD_DATABASE_MAX_SIZE_BYTES_ENV}).
 * - The WAL is not counted by `max_page_count`: Litestream owns checkpointing
 *   and truncates the WAL as frames are replicated (see `applyPragmas`).
 *
 * The cap turns runaway state growth into an actionable error well before the
 * disk is full, instead of unrecoverable ENOSPC everywhere. It is not a
 * security boundary — workload code can write to the filesystem directly; the
 * sandbox's own disk is the hard limit, and filling it breaks only this pod's
 * sandbox.
 */

/**
 * Env var pointing at the live databases directory, required. The location is
 * hardcoded once, in front (`POD_SANDBOX_DATABASES_DIR`), passed per-exec to
 * `dsbx function run`, which forwards it here — no layer below front carries
 * its own copy of the path.
 */
export const POD_DATABASES_DIR_ENV = "DUST_POD_DATABASES_DIR";

/**
 * Sandbox-global env var carrying the pod sId — set at sandbox creation for
 * pod-owned sandboxes only. Its absence means this is not a pod sandbox
 * (e.g. a conversation sandbox), where pod databases do not exist.
 */
export const POD_SPACE_ID_ENV = "SPACE_ID";

/**
 * Optional env override for the per-database size quota, in bytes. Clamped to
 * the default: this env var lives in the (untrusted) workload's own process,
 * so it can only LOWER the quota (a test/ops seam), never raise it.
 */
export const POD_DATABASE_MAX_SIZE_BYTES_ENV =
  "DUST_POD_DATABASE_MAX_SIZE_BYTES";

/** Per-database size quota default: 1 GiB, enforced via `PRAGMA max_page_count`. */
export const DEFAULT_POD_DATABASE_MAX_SIZE_BYTES = 1024 * 1024 * 1024;

/** How long a connection waits on a locked database before failing. */
export const POD_DATABASE_BUSY_TIMEOUT_MS = 5000;

/** Valid database names (also the manifest/publish contract). */
export const POD_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

export class PodDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PodDatabaseError";
  }
}

export class PodDatabaseInvalidNameError extends PodDatabaseError {
  constructor(name: string) {
    super(
      `Invalid pod database name ${JSON.stringify(name)}: names must match ` +
        `${POD_DATABASE_NAME_REGEX.source} (lowercase letter first, then lowercase ` +
        `letters, digits or underscores, 64 characters max).`
    );
    this.name = "PodDatabaseInvalidNameError";
  }
}

export class PodDatabasesUnavailableError extends PodDatabaseError {
  constructor() {
    super(
      `Pod databases are not available in this sandbox: ${POD_SPACE_ID_ENV} ` +
        `is not set, which means this sandbox does not belong to a pod ` +
        `(conversation sandboxes have no pod databases). db() only works in ` +
        `functions running in a pod sandbox.`
    );
    this.name = "PodDatabasesUnavailableError";
  }
}

export class PodDatabaseNotDeclaredError extends PodDatabaseError {
  constructor(dbName: string, path: string) {
    super(
      `Pod database "${dbName}" does not exist (no database file at ${path}). ` +
        `Databases are created by the first publish that declares them: add ` +
        `"${dbName}" to a function's schema.databases, define its tables in ` +
        `databases/${dbName}.db.ts, and publish that function.`
    );
    this.name = "PodDatabaseNotDeclaredError";
  }
}

export class PodDatabaseFullError extends PodDatabaseError {
  constructor(dbName: string, maxSizeBytes: number) {
    super(
      `Pod database "${dbName}" is full: it reached its size quota of ` +
        `${maxSizeBytes} bytes. Delete unneeded rows to reclaim space before ` +
        `writing more data.`
    );
    this.name = "PodDatabaseFullError";
  }
}

/** The Drizzle handle returned by {@link db}. */
export type PodDatabase = BunSQLiteDatabase<Record<string, never>> & {
  $client: Database;
};

function isSqliteErrorWithCode(err: unknown, code: string): boolean {
  return err instanceof Error && "code" in err && err.code === code;
}

/**
 * Statement methods that execute SQL and can therefore surface `SQLITE_FULL`.
 * (Also covers commit-time errors: bun:sqlite's `Database.transaction()` builds
 * its BEGIN/COMMIT statements through `Database.prepare`.)
 */
const EXECUTING_STATEMENT_METHODS = new Set<PropertyKey>([
  "run",
  "get",
  "all",
  "values",
  "iterate",
]);

function translateSqliteError(
  err: unknown,
  dbName: string,
  maxSizeBytes: number
): unknown {
  if (isSqliteErrorWithCode(err, "SQLITE_FULL")) {
    return new PodDatabaseFullError(dbName, maxSizeBytes);
  }
  return err;
}

/** Wrap a prepared statement so executing it translates `SQLITE_FULL`. */
function wrapStatement<T extends object>(
  stmt: T,
  dbName: string,
  maxSizeBytes: number
): T {
  return new Proxy(stmt, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") {
        return value;
      }
      if (!EXECUTING_STATEMENT_METHODS.has(prop)) {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        try {
          return value.apply(target, args);
        } catch (err) {
          throw translateSqliteError(err, dbName, maxSizeBytes);
        }
      };
    },
  });
}

/**
 * A bun:sqlite Database that translates `SQLITE_FULL` (the quota surface of
 * `PRAGMA max_page_count`) into {@link PodDatabaseFullError} on every
 * execution path Drizzle uses: `exec`/`run` directly, and statements obtained
 * through `prepare` (which `query()` and `transaction()` also go through).
 */
class PodSqliteDatabase extends Database {
  readonly #dbName: string;
  readonly #maxSizeBytes: number;

  constructor(path: string, dbName: string, maxSizeBytes: number) {
    // readwrite without create: opening a missing file throws SQLITE_CANTOPEN
    // instead of minting an empty database (verified against bun 1.3.14).
    super(path, { readwrite: true });
    this.#dbName = dbName;
    this.#maxSizeBytes = maxSizeBytes;
  }

  run<ParamsType extends SQLQueryBindings[]>(
    sql: string,
    ...bindings: ParamsType[]
  ): Changes {
    try {
      return super.run(sql, ...bindings);
    } catch (err) {
      throw translateSqliteError(err, this.#dbName, this.#maxSizeBytes);
    }
  }

  exec<ParamsType extends SQLQueryBindings[]>(
    sql: string,
    ...bindings: ParamsType[]
  ): Changes {
    try {
      return super.exec(sql, ...bindings);
    } catch (err) {
      throw translateSqliteError(err, this.#dbName, this.#maxSizeBytes);
    }
  }

  prepare<ReturnType, ParamsType extends SQLQueryBindings | SQLQueryBindings[]>(
    sql: string,
    params?: ParamsType
    // The `any[]` conditional mirrors bun:sqlite's own Database.prepare signature.
  ): Statement<
    ReturnType,
    ParamsType extends any[] ? ParamsType : [ParamsType]
  > {
    const stmt = super.prepare<ReturnType, ParamsType>(sql, params);
    return wrapStatement(stmt, this.#dbName, this.#maxSizeBytes);
  }
}

function podDatabasesDir(): string {
  const dir = process.env[POD_DATABASES_DIR_ENV];
  if (dir === undefined || dir.length === 0) {
    throw new PodDatabaseError(
      `${POD_DATABASES_DIR_ENV} is not set: the databases directory is ` +
        `chosen by front and passed through dsbx function run, so db() only ` +
        `works in functions launched that way.`
    );
  }
  return dir;
}

function podDatabaseMaxSizeBytes(): number {
  const raw = process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV];
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_POD_DATABASE_MAX_SIZE_BYTES;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_POD_DATABASE_MAX_SIZE_BYTES;
  }
  // Clamp: the override is workload-settable, so it can only lower the quota.
  return Math.min(parsed, DEFAULT_POD_DATABASE_MAX_SIZE_BYTES);
}

/**
 * Per-connection settings, re-applied on every open. `journal_mode = WAL` is
 * not set here: it is a persistent per-database setting, applied once when
 * the publish pipeline creates the file.
 */
function applyPragmas(sqlite: PodSqliteDatabase, maxSizeBytes: number): void {
  // WAL allows a single writer at a time: concurrent function invocations —
  // and Litestream, which briefly takes the write lock to checkpoint — must
  // wait for it instead of failing instantly with SQLITE_BUSY. 5s is the
  // value the Litestream docs recommend and comfortably covers the short
  // transactions functions are expected to run.
  sqlite.exec(`PRAGMA busy_timeout = ${POD_DATABASE_BUSY_TIMEOUT_MS}`);
  // Under WAL, NORMAL fsyncs at checkpoint time instead of on every commit:
  // a host crash can lose the most recent commits but cannot corrupt the
  // database. Commits happen inside function calls, so FULL's per-commit
  // fsync would be paid as agent-visible latency for durability we get from
  // replication anyway.
  sqlite.exec("PRAGMA synchronous = NORMAL");
  // Litestream replicates by tailing the WAL and owns checkpointing: it
  // holds a long-running read lock and checkpoints itself once frames are
  // replicated, truncating the WAL (which is what bounds WAL growth, since
  // max_page_count below does not count WAL pages). An application
  // checkpoint slipping in between Litestream's own can make it miss WAL
  // frames and force a full re-snapshot, so SQLite must never checkpoint on
  // its own.
  sqlite.exec("PRAGMA wal_autocheckpoint = 0");
  const row = sqlite.query<{ page_size: number }, []>("PRAGMA page_size").get();
  if (row === null) {
    throw new PodDatabaseError("PRAGMA page_size returned no row");
  }
  // The per-database size cap (see the module doc). max_page_count counts
  // pages, so the byte quota is converted using this database's actual page
  // size. It is per-connection state, hence re-applied on every open. If the
  // database already exceeds the cap, SQLite clamps the value up to the
  // current page count: reads and deletes keep working, growth doesn't.
  const maxPageCount = Math.max(1, Math.floor(maxSizeBytes / row.page_size));
  sqlite.exec(`PRAGMA max_page_count = ${maxPageCount}`);
}

// One instance per resolved database file path, opened lazily on first db().
const instances = new Map<string, PodDatabase>();

/**
 * Get the pod's Drizzle handle for database `name`.
 *
 * @throws PodDatabaseInvalidNameError when `name` does not match the contract.
 * @throws PodDatabasesUnavailableError when SPACE_ID is absent — this sandbox
 *   is not pod-owned (conversation sandboxes have no pod databases).
 * @throws PodDatabaseError when DUST_POD_DATABASES_DIR is absent — db() only
 *   works in functions launched by `dsbx function run`.
 * @throws PodDatabaseNotDeclaredError when no database file exists — databases
 *   are created by the first publish that declares them.
 * @throws PodDatabaseFullError (from queries) when the database hits its quota.
 */
export function db(name: string): PodDatabase {
  if (!POD_DATABASE_NAME_REGEX.test(name)) {
    throw new PodDatabaseInvalidNameError(name);
  }
  const spaceId = process.env[POD_SPACE_ID_ENV];
  if (spaceId === undefined || spaceId.length === 0) {
    throw new PodDatabasesUnavailableError();
  }
  const path = `${podDatabasesDir()}/${name}.db`;
  const cached = instances.get(path);
  if (cached !== undefined) {
    return cached;
  }

  const maxSizeBytes = podDatabaseMaxSizeBytes();
  let sqlite: PodSqliteDatabase;
  try {
    sqlite = new PodSqliteDatabase(path, name, maxSizeBytes);
  } catch (err) {
    if (isSqliteErrorWithCode(err, "SQLITE_CANTOPEN")) {
      throw new PodDatabaseNotDeclaredError(name, path);
    }
    throw err;
  }
  applyPragmas(sqlite, maxSizeBytes);

  const instance = drizzle(sqlite);
  instances.set(path, instance);
  return instance;
}
