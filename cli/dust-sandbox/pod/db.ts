import type { Changes, SQLQueryBindings, Statement } from "bun:sqlite";
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { z } from "zod";

import { podEnv } from "./context.ts";

/**
 * Frame and Pod state databases.
 *
 * `db(name)` returns a cached Drizzle instance over the sandbox owner's live
 * SQLite database at `${DUST_SANDBOX_DATABASES_DIR}/{prefix}{name}.db`. Pod names
 * may be prefixed; Frame names are unprefixed and must be declared by the
 * selected immutable publication. Databases are created by reconciliation,
 * never here: the file is opened must-exist so a typo'd name errors clearly
 * instead of minting an empty database. Functions that never call `db()` pay
 * nothing.
 *
 * `name` is the app-relative name the function's source writes, and the app
 * prefix comes from the environment ({@link SANDBOX_DATABASE_PREFIX_ENV}) rather
 * than the source. That is what lets a whole app folder be copied within a pod
 * without editing any source: the copy publishes under its own prefix and
 * therefore resolves `db("chat")` to its own database. See
 * {@link resolveDatabasePath} for the resolution order.
 *
 * Disk guardrails — sandbox state must not fill the sandbox disk by accident:
 *
 * - `db()` cannot create database files (must-exist open), so the set of
 *   databases is fixed by what reconcile has created. Total sandbox-state
 *   footprint is the number of databases times the per-database cap;
 *   bounding the count is the reconcile path's job.
 * - Each database is capped via `PRAGMA max_page_count` at the byte quota
 *   front chooses and passes per exec (1 GiB in production — see
 *   {@link SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV}). Writes past the cap fail with
 *   {@link SandboxDatabaseFullError}; the database stays readable and rows can
 *   still be deleted, so the agent recovers in place by reclaiming space.
 * - The WAL is not counted by `max_page_count`: Litestream owns checkpointing
 *   and truncates the WAL as frames are replicated (see `applyPragmas`).
 *
 * The cap turns runaway state growth into an actionable error well before the
 * disk is full, instead of unrecoverable ENOSPC everywhere. It is not a
 * security boundary — workload code can write to the filesystem directly; the
 * sandbox's own disk is the hard limit, and filling it breaks only this
 * owner's sandbox.
 */

/**
 * Env var pointing at the live databases directory, required. The location is
 * hardcoded once, in front (`SANDBOX_STATE_DATABASES_DIR`), passed per-exec to
 * `dsbx function run`, which forwards it here — no layer below front carries
 * its own copy of the path.
 */
export const SANDBOX_DATABASES_DIR_ENV = "DUST_SANDBOX_DATABASES_DIR";

/** Legacy env key read for sandboxes launched before the owner-neutral ABI. */
export const POD_DATABASES_DIR_ENV = "DUST_POD_DATABASES_DIR";

/**
 * Sandbox-global env var carrying the Pod sId for Pod-owned sandboxes.
 */
export const POD_SPACE_ID_ENV = "SPACE_ID";

/** Sandbox-global env var carrying the Frame sId for Frame-owned sandboxes. */
export const FRAME_ID_ENV = "FRAME_ID";

/** Exact immutable publication descriptor selected for a Frame invocation. */
export const FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV =
  "DUST_FRAME_PUBLICATION_DESCRIPTOR_PATH";

/**
 * Env var carrying the per-database size quota in bytes, required. Like the
 * databases directory, the value is owned by front (1 GiB in production) and
 * passed per-exec through dsbx — no copy of the number lives below front.
 * It lives in the (untrusted) workload's own process, so workload code can
 * rewrite it — acceptable because the cap is not a security boundary (see
 * the module doc).
 */
export const SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV =
  "DUST_SANDBOX_DATABASE_MAX_SIZE_BYTES";

/** Legacy env key read for sandboxes launched before the owner-neutral ABI. */
export const POD_DATABASE_MAX_SIZE_BYTES_ENV =
  "DUST_POD_DATABASE_MAX_SIZE_BYTES";

/**
 * Env var carrying the per-invocation database namespace prefix (separator
 * included, e.g. `"myapp__"`). Optional: empty or absent means unprefixed
 * names, including Frame functions and Pod functions published outside an app
 * folder.
 *
 * Front owns the value and derives it from the invoked function's slug, so no
 * layer below front knows how a prefix is built. Read through `podEnv`, so a
 * resident server serving two apps resolves each invocation against its own
 * prefix rather than a process-wide one.
 *
 * Not a security boundary: the databases directory is local disk the workload
 * can read and write directly, so app prefixing prevents accidental collisions
 * between apps, it does not isolate them.
 */
export const SANDBOX_DATABASE_PREFIX_ENV = "DUST_SANDBOX_DATABASE_PREFIX";

/** Legacy env key read for sandboxes launched before the owner-neutral ABI. */
export const POD_DATABASE_PREFIX_ENV = "DUST_POD_DATABASE_PREFIX";

/** How long a connection waits on a locked database before failing. */
export const SANDBOX_DATABASE_BUSY_TIMEOUT_MS = 5000;

/** Compatibility alias for existing `@dust/pod` consumers. */
export const POD_DATABASE_BUSY_TIMEOUT_MS = SANDBOX_DATABASE_BUSY_TIMEOUT_MS;

/** Valid database names (also the manifest/publish contract). */
export const SANDBOX_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

/** Compatibility alias for existing `@dust/pod` consumers. */
export const POD_DATABASE_NAME_REGEX = SANDBOX_DATABASE_NAME_REGEX;
export const SUPPORTED_FRAME_PUBLICATION_SCHEMA_VERSION = 1;

const framePublicationDatabaseContractSchema = z.object({
  schemaVersion: z.literal(SUPPORTED_FRAME_PUBLICATION_SCHEMA_VERSION),
  manifest: z.object({
    databases: z.array(
      z.object({ name: z.string().regex(SANDBOX_DATABASE_NAME_REGEX) })
    ),
  }),
});

/**
 * Compatibility ABI: shared errors keep their legacy `Pod*` `Error.name`
 * values while the legacy class aliases below remain public.
 */
export class SandboxDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PodDatabaseError";
  }
}

export class SandboxDatabaseInvalidNameError extends SandboxDatabaseError {
  constructor(name: string) {
    super(
      `Invalid sandbox database name ${JSON.stringify(name)}: names must match ` +
        `${SANDBOX_DATABASE_NAME_REGEX.source} (lowercase letter first, then lowercase ` +
        `letters, digits or underscores, 64 characters max).`
    );
    this.name = "PodDatabaseInvalidNameError";
  }
}

export class SandboxDatabasesUnavailableError extends SandboxDatabaseError {
  constructor() {
    super(
      `Databases are not available in this sandbox: neither ${POD_SPACE_ID_ENV} ` +
        `nor ${FRAME_ID_ENV} is set, so the sandbox has no database owner. ` +
        `db() only works in an owner-bound function sandbox.`
    );
    this.name = "PodDatabasesUnavailableError";
  }
}

export class FramePublicationDescriptorError extends SandboxDatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "FramePublicationDescriptorError";
  }
}

export class FrameDatabaseNotDeclaredError extends SandboxDatabaseError {
  constructor(dbName: string) {
    super(
      `Frame database "${dbName}" is not declared in this publication. ` +
        `Declare it in manifest.json and publish the Frame again.`
    );
    this.name = "FrameDatabaseNotDeclaredError";
  }
}

export class FrameDatabaseUnavailableError extends SandboxDatabaseError {
  constructor(dbName: string, path: string) {
    super(
      `Frame database "${dbName}" is declared but unavailable (no database ` +
        `file at ${path}). Publish the Frame again to reconcile its state.`
    );
    this.name = "FrameDatabaseUnavailableError";
  }
}

export class PodDatabaseNotDeclaredError extends SandboxDatabaseError {
  constructor(dbName: string, path: string) {
    super(
      `Pod database "${dbName}" does not exist (no database file at ${path}). ` +
        `Databases are created by their first reconcile: define the tables in ` +
        `databases/${dbName}.db.ts, apply it with the db_reconcile tool, and ` +
        `declare "${dbName}" in the function's schema.databases.`
    );
    this.name = "PodDatabaseNotDeclaredError";
  }
}

export class SandboxDatabaseFullError extends SandboxDatabaseError {
  constructor(dbName: string, maxSizeBytes: number) {
    super(
      `Sandbox database "${dbName}" is full: it reached its size quota of ` +
        `${maxSizeBytes} bytes. Delete unneeded rows to reclaim space before ` +
        `writing more data.`
    );
    this.name = "PodDatabaseFullError";
  }
}

/** The Drizzle handle returned by {@link db}. */
export type SandboxDatabase = BunSQLiteDatabase<Record<string, never>> & {
  $client: Database;
};

// Keep the original public API working while new callers use owner-neutral names.
export {
  SandboxDatabaseError as PodDatabaseError,
  SandboxDatabaseFullError as PodDatabaseFullError,
  SandboxDatabaseInvalidNameError as PodDatabaseInvalidNameError,
  SandboxDatabasesUnavailableError as PodDatabasesUnavailableError,
};
export type PodDatabase = SandboxDatabase;

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
    return new SandboxDatabaseFullError(dbName, maxSizeBytes);
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
 * `PRAGMA max_page_count`) into {@link SandboxDatabaseFullError} on every
 * execution path Drizzle uses: `exec`/`run` directly, and statements obtained
 * through `prepare` (which `query()` and `transaction()` also go through).
 */
class SandboxSqliteDatabase extends Database {
  private readonly dbName: string;
  private readonly maxSizeBytes: number;

  constructor(path: string, dbName: string, maxSizeBytes: number) {
    // readwrite without create: opening a missing file throws SQLITE_CANTOPEN
    // instead of minting an empty database (verified against bun 1.3.14).
    super(path, { readwrite: true });
    this.dbName = dbName;
    this.maxSizeBytes = maxSizeBytes;
  }

  override run<ParamsType extends SQLQueryBindings[]>(
    sql: string,
    ...bindings: ParamsType[]
  ): Changes {
    try {
      return super.run(sql, ...bindings);
    } catch (err) {
      throw translateSqliteError(err, this.dbName, this.maxSizeBytes);
    }
  }

  override exec<ParamsType extends SQLQueryBindings[]>(
    sql: string,
    ...bindings: ParamsType[]
  ): Changes {
    try {
      return super.exec(sql, ...bindings);
    } catch (err) {
      throw translateSqliteError(err, this.dbName, this.maxSizeBytes);
    }
  }

  override prepare<
    ReturnType,
    ParamsType extends SQLQueryBindings | SQLQueryBindings[],
  >(
    sql: string,
    params?: ParamsType
    // The `any[]` conditional mirrors bun:sqlite's own Database.prepare signature.
  ): Statement<
    ReturnType,
    ParamsType extends any[] ? ParamsType : [ParamsType]
  > {
    const stmt = super.prepare<ReturnType, ParamsType>(sql, params);
    return wrapStatement(stmt, this.dbName, this.maxSizeBytes);
  }
}

function sandboxDatabasesDir(): string {
  const dir =
    podEnv(SANDBOX_DATABASES_DIR_ENV) ?? podEnv(POD_DATABASES_DIR_ENV);
  if (dir === undefined || dir.length === 0) {
    throw new SandboxDatabaseError(
      `${SANDBOX_DATABASES_DIR_ENV} is not set: the databases directory is ` +
        `chosen by front and passed through dsbx function run, so db() only ` +
        `works in functions launched that way.`
    );
  }
  return dir;
}

/**
 * Resolve the app-relative `name` to a database file path.
 *
 * Order, and why: the app-prefixed file wins when it exists, so an app that has
 * been reconciled under app namespacing always gets its own database. Otherwise
 * the bare name is used, which covers two cases — functions published outside an
 * app folder (no prefix at all), and databases created before app namespacing
 * existed, whose files are still on disk under their bare names.
 *
 * That bare-name branch is transitional. While it is in place, two apps that
 * both reconcile a name which already exists unprefixed keep sharing that one
 * legacy database, exactly as they do today; only databases created from here on
 * are namespaced. Reconcile applies the same order (in front), so the file
 * db() opens is always the file reconcile applied the schema to.
 */
function resolveDatabasePath(dir: string, name: string): string {
  // Through podEnv, like every other env read here: a resident server runs
  // concurrent invocations from different apps, and their prefixes differ. Read
  // straight from process.env and every warm invocation would resolve against
  // whichever prefix the cold run happened to leave there.
  const prefix =
    podEnv(SANDBOX_DATABASE_PREFIX_ENV) ??
    podEnv(POD_DATABASE_PREFIX_ENV) ??
    "";
  if (prefix.length > 0) {
    // No need to re-check the name contract here: a prefix long enough to push
    // the qualified name past it is one reconcile refuses to create a file for,
    // so the existence check below is what rejects it.
    const prefixedPath = `${dir}/${prefix}${name}.db`;
    if (existsSync(prefixedPath)) {
      return prefixedPath;
    }
  }
  return `${dir}/${name}.db`;
}

function sandboxDatabaseMaxSizeBytes(): number {
  const raw =
    podEnv(SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV) ??
    podEnv(POD_DATABASE_MAX_SIZE_BYTES_ENV);
  if (raw === undefined || raw.length === 0) {
    throw new SandboxDatabaseError(
      `${SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV} is not set: the per-database size ` +
        `quota is chosen by front and passed through dsbx function run, so ` +
        `db() only works in functions launched that way.`
    );
  }
  // Decimal digits only: Number() alone would also accept "1e3" or "0x10".
  const parsed = /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    // No default to fall back to; failing loudly beats masking a broken quota.
    throw new SandboxDatabaseError(
      `${SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV} is not a positive integer byte ` +
        `count: ${JSON.stringify(raw)}.`
    );
  }
  return parsed;
}

/**
 * Per-connection settings, re-applied on every open. `journal_mode = WAL` is
 * not set here: it is a persistent per-database setting, applied once when
 * reconcile creates the file.
 */
function applyPragmas(
  sqlite: SandboxSqliteDatabase,
  maxSizeBytes: number
): void {
  // WAL allows a single writer at a time: concurrent function invocations —
  // and Litestream, which briefly takes the write lock to checkpoint — must
  // wait for it instead of failing instantly with SQLITE_BUSY. 5s is the
  // value the Litestream docs recommend and comfortably covers the short
  // transactions functions are expected to run.
  sqlite.exec(`PRAGMA busy_timeout = ${SANDBOX_DATABASE_BUSY_TIMEOUT_MS}`);
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
    throw new SandboxDatabaseError("PRAGMA page_size returned no row");
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
const instances = new Map<string, SandboxDatabase>();

// Publication descriptors are immutable, so declarations can be cached by
// their exact mounted path without mixing warm invocations across publications.
const frameDatabaseDeclarations = new Map<string, ReadonlySet<string>>();

function declaredFrameDatabases(frameId: string): ReadonlySet<string> {
  const descriptorPath = podEnv(FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV);
  if (!descriptorPath) {
    throw new FramePublicationDescriptorError(
      `${FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV} is not set for Frame ` +
        `${frameId}: db() requires the selected publication descriptor.`
    );
  }

  const cached = frameDatabaseDeclarations.get(descriptorPath);
  if (cached) {
    return cached;
  }

  let descriptorJson: unknown;
  try {
    descriptorJson = JSON.parse(readFileSync(descriptorPath, "utf8"));
  } catch {
    throw new FramePublicationDescriptorError(
      `The Frame publication descriptor at ${descriptorPath} cannot be read ` +
        `or is not valid JSON.`
    );
  }

  const descriptor =
    framePublicationDatabaseContractSchema.safeParse(descriptorJson);
  if (!descriptor.success) {
    throw new FramePublicationDescriptorError(
      `The Frame publication descriptor at ${descriptorPath} has an invalid ` +
        `database contract.`
    );
  }

  const declarations = new Set(
    descriptor.data.manifest.databases.map(({ name }) => name)
  );
  frameDatabaseDeclarations.set(descriptorPath, declarations);
  return declarations;
}

/** Returns whether this invocation uses Frame-owned state. */
function assertDatabaseOwnerCanUse(name: string): boolean {
  const frameId = podEnv(FRAME_ID_ENV);
  if (frameId) {
    if (!declaredFrameDatabases(frameId).has(name)) {
      throw new FrameDatabaseNotDeclaredError(name);
    }
    return true;
  }

  const spaceId = podEnv(POD_SPACE_ID_ENV);
  if (!spaceId) {
    throw new SandboxDatabasesUnavailableError();
  }
  return false;
}

/**
 * Get the sandbox owner's Drizzle handle for database `name`. Pod functions
 * resolve app-relative names through {@link resolveDatabasePath}; Frame
 * functions use unprefixed names declared by the selected publication.
 *
 * @throws SandboxDatabaseInvalidNameError when `name` does not match the contract.
 * @throws SandboxDatabasesUnavailableError when both SPACE_ID and FRAME_ID are
 *   absent, so this sandbox has no database owner.
 * @throws FramePublicationDescriptorError when a Frame invocation has no valid
 *   selected publication descriptor.
 * @throws FrameDatabaseNotDeclaredError when the selected Frame publication
 *   does not declare `name`.
 * @throws FrameDatabaseUnavailableError when declared state was not reconciled.
 * @throws SandboxDatabaseError when DUST_SANDBOX_DATABASES_DIR or
 *   DUST_SANDBOX_DATABASE_MAX_SIZE_BYTES is absent or invalid. db() only works
 *   in functions launched by `dsbx function run`.
 * @throws PodDatabaseNotDeclaredError for a Pod function when no database file exists. Databases
 *   are created by their first reconcile.
 * @throws SandboxDatabaseFullError (from queries) when the database hits its quota.
 */
export function db(name: string): SandboxDatabase {
  if (!SANDBOX_DATABASE_NAME_REGEX.test(name)) {
    throw new SandboxDatabaseInvalidNameError(name);
  }
  // Recheck before the instance cache: a warm worker may have opened this
  // database for an older publication that declared it.
  const isFrame = assertDatabaseOwnerCanUse(name);
  const path = resolveDatabasePath(sandboxDatabasesDir(), name);
  const cached = instances.get(path);
  if (cached !== undefined) {
    return cached;
  }

  const maxSizeBytes = sandboxDatabaseMaxSizeBytes();
  let sqlite: SandboxSqliteDatabase;
  try {
    sqlite = new SandboxSqliteDatabase(path, name, maxSizeBytes);
  } catch (err) {
    if (isSqliteErrorWithCode(err, "SQLITE_CANTOPEN")) {
      if (isFrame) {
        throw new FrameDatabaseUnavailableError(name, path);
      }
      throw new PodDatabaseNotDeclaredError(name, path);
    }
    throw err;
  }
  applyPragmas(sqlite, maxSizeBytes);

  const instance = drizzle(sqlite);
  instances.set(path, instance);
  return instance;
}
