import { Database, type Statement } from "bun:sqlite";
import { closeSync, existsSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Err, Ok, type Result } from "../result.ts";
import { applyWritePragmas, DbCommandError } from "./common.ts";

export const QUERY_INLINE_ROW_CAP = 100;
export const QUERY_INLINE_PAYLOAD_CAP_BYTES = 100_000;

const ALLOWED_KEYWORDS = new Set([
  "select",
  "values",
  "with",
  "insert",
  "update",
  "delete",
  "replace",
]);

export interface QueryOutcome {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  changes: number | null;
  results_file: string | null;
  note: string | null;
}

export function runQuery(
  dbPath: string,
  sql: string,
  // Omitted only by tests that don't exercise the quota; runner.ts always passes it.
  maxSizeBytes?: number
): Result<QueryOutcome, DbCommandError> {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return new Err(
      new DbCommandError("empty_sql", "no SQL statement provided on stdin")
    );
  }

  // Statement-type allowlist, matched on the raw text before preparing. This is the ONLY use of
  // the leading keyword: it decides what the caller may run, never how the statement executes.
  // It cannot be replaced with something more precise — bun:sqlite exposes neither an authorizer
  // (sqlite3_set_authorizer) nor a per-statement readonly flag (sqlite3_stmt_readonly), so there
  // is nothing to ask SQLite about a prepared statement's effects. An anchored allowlist is the
  // fail-closed direction: a leading comment, PRAGMA, ATTACH, VACUUM, or any DDL keyword misses
  // the match and is refused (gating before prepare also sidesteps the pragmas that act at
  // compile time: https://sqlite.org/pragma.html). It is sound because bun compiles/executes only
  // the first statement (the multi-statement guard below rejects any trailing text) and SQLite's
  // grammar is prefix-keyword-determined: nothing starting with SELECT/VALUES can write, and a
  // WITH can carry neither DDL nor a data-modifying CTE (SQLite rejects `WITH x AS (INSERT …)`).
  // Whatever slips past is still caught behaviorally by the schema_version barrier below.
  const keyword = trimmed.match(/^[A-Za-z]+/)?.[0].toLowerCase();
  if (keyword === undefined || !ALLOWED_KEYWORDS.has(keyword)) {
    return new Err(
      new DbCommandError(
        "disallowed_statement",
        "only SELECT and DML (INSERT/UPDATE/DELETE/REPLACE, optionally WITH) are allowed; " +
          "schema changes go through reconcile"
      )
    );
  }

  const opened = openReadwrite(dbPath, maxSizeBytes);
  if (opened.isErr()) {
    return opened;
  }
  const db = opened.value;
  try {
    let statement: Statement;
    try {
      statement = db.query(trimmed);
    } catch (e) {
      return new Err(
        new DbCommandError(
          "query_failed",
          e instanceof Error ? e.message : String(e)
        )
      );
    }

    // Bound parameters have no binding API on this path — an unbound `?` would silently run
    // with NULL, and parameters also defeat the multi-statement check below (toString()
    // diverges from the source text).
    if (statement.paramsCount > 0) {
      return new Err(
        new DbCommandError(
          "query_failed",
          "bound parameters are not supported; inline the values in the statement"
        )
      );
    }

    // bun:sqlite compiles only the FIRST statement and never executes what follows, so a
    // multi-statement script would silently return partial results. Instead of parsing SQL
    // ourselves, surface SQLite's own parse boundary: Statement.toString() is the compiled
    // statement's text, so any non-whitespace input beyond it is a second statement.
    const compiled = statement.toString();
    if (
      trimmed.startsWith(compiled) &&
      trimmed.slice(compiled.length).trim().length > 0
    ) {
      return new Err(
        new DbCommandError(
          "query_failed",
          "multiple SQL statements are not supported; send a single statement"
        )
      );
    }

    // One statement, one transaction — the same path for reads and writes. The schema_version
    // re-check is the real barrier behind the keyword gate: anything that reached here and still
    // moved the schema is turned into an Err and never committed; a read leaves the version
    // untouched. BEGIN IMMEDIATE means a read holds the write lock for its duration — fine for a
    // single-writer per-pod database, and the price of not branching on a read/write guess that
    // bun gives us no reliable way to make.
    db.exec("BEGIN IMMEDIATE;");
    const versionBefore = schemaVersion(db);
    let result = execute(statement);
    if (result.isOk() && schemaVersion(db) !== versionBefore) {
      result = new Err(
        new DbCommandError(
          "disallowed_statement",
          "the statement changed the database schema; schema changes go through reconcile"
        )
      );
    }

    // Commit only a clean result. Every other exit — an Err above, or a throw from execute /
    // schemaVersion — leaves the transaction open, and db.close() in the finally discards it
    // (SQLite rolls back an uncommitted transaction on close). There is no explicit ROLLBACK,
    // so there is no "no transaction is active" error to swallow.
    if (result.isOk()) {
      db.exec("COMMIT;");
    }
    return result;
  } finally {
    db.close();
  }
}

// Open read-write, must-exist: databases are only ever created by reconcile.
function openReadwrite(
  dbPath: string,
  maxSizeBytes: number | undefined
): Result<Database, DbCommandError> {
  if (!existsSync(dbPath)) {
    return new Err(
      new DbCommandError(
        "database_not_found",
        `no database at ${dbPath}; it is created by the first reconcile that claims it`
      )
    );
  }
  let db: Database;
  try {
    // safeIntegers reads INTEGER columns as bigint instead of a possibly-lossy JS number
    // (SQLite integers are 64-bit, JS numbers are exact only to 2^53):
    // https://bun.com/docs/api/sqlite#datatypes
    db = new Database(dbPath, {
      readwrite: true,
      create: false,
      safeIntegers: true,
    });
  } catch (e) {
    return new Err(
      new DbCommandError(
        "internal",
        `cannot open database at ${dbPath}: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    );
  }
  applyWritePragmas(db);
  if (maxSizeBytes !== undefined) {
    // The size cap @dust/pod enforces on workload writes; a write past it fails with SQLITE_FULL
    // (-> database_full). page_size is a bigint here (safeIntegers) but small enough for Number().
    const row = db.query<{ page_size: bigint }, []>("PRAGMA page_size").get();
    if (row === null) {
      return new Err(
        new DbCommandError("internal", "PRAGMA page_size returned no row")
      );
    }
    const maxPageCount = Math.max(
      1,
      Math.floor(maxSizeBytes / Number(row.page_size))
    );
    db.exec(`PRAGMA max_page_count = ${maxPageCount};`);
  }
  return new Ok(db);
}

// SQLite bumps schema_version on every schema change:
// https://sqlite.org/pragma.html#pragma_schema_version
function schemaVersion(db: Database): bigint {
  const row = db
    .query<{ schema_version: bigint | number }, []>("PRAGMA schema_version")
    .get();
  return BigInt(row?.schema_version ?? 0);
}

// SQLITE_FULL means the size quota was hit; everything else is a plain query failure.
function executionError(e: unknown): DbCommandError {
  if (e instanceof Error && "code" in e && e.code === "SQLITE_FULL") {
    return new DbCommandError(
      "database_full",
      "the database reached its size quota; delete rows to reclaim space before writing more"
    );
  }
  return new DbCommandError(
    "query_failed",
    e instanceof Error ? e.message : String(e)
  );
}

// Run one prepared statement and shape its output. A statement that returns no columns is a
// plain INSERT/UPDATE/DELETE: execute it and report the affected-row count, the only meaningful
// output run() surfaces. Anything with columns — SELECT, VALUES, or a RETURNING clause — streams
// its rows through collectRows, spilling past the inline bounds. columnNames, not the keyword, is
// the discriminator, so `INSERT … RETURNING` correctly returns its rows.
function execute(statement: Statement): Result<QueryOutcome, DbCommandError> {
  if (statement.columnNames.length > 0) {
    return collectRows(statement);
  }
  let changes: number;
  try {
    changes = Number(statement.run().changes);
  } catch (e) {
    return new Err(executionError(e));
  }
  return new Ok({
    columns: [],
    rows: [],
    row_count: 0,
    changes,
    results_file: null,
    note: null,
  });
}

// Execute a result-returning statement, spilling beyond the inline bounds.
function collectRows(
  statement: Statement
): Result<QueryOutcome, DbCommandError> {
  const preview: Record<string, unknown>[] = [];
  let previewBytes = 0;
  const previewJson: string[] = [];
  let rowCount = 0;
  let spillFd: number | null = null;
  let spillPath: string | null = null;
  try {
    for (const row of statement.iterate()) {
      rowCount++;
      const rowJson = JSON.stringify(row, jsonReplacer);
      if (spillFd === null) {
        if (
          preview.length < QUERY_INLINE_ROW_CAP &&
          previewBytes + Buffer.byteLength(rowJson, "utf8") <=
            QUERY_INLINE_PAYLOAD_CAP_BYTES
        ) {
          preview.push(JSON.parse(rowJson));
          previewBytes += Buffer.byteLength(rowJson, "utf8");
          previewJson.push(rowJson);
          continue;
        }
        spillPath = join(tmpdir(), `dsbx-query-${crypto.randomUUID()}.jsonl`);
        spillFd = openSync(spillPath, "w");
        for (const line of previewJson) {
          writeSync(spillFd, `${line}\n`);
        }
      }
      writeSync(spillFd, `${rowJson}\n`);
    }
  } catch (e) {
    return new Err(executionError(e));
  } finally {
    if (spillFd !== null) {
      closeSync(spillFd);
    }
  }

  return new Ok({
    columns: statement.columnNames,
    rows: preview,
    row_count: rowCount,
    changes: null,
    results_file: spillPath,
    note:
      spillPath === null
        ? null
        : `${rowCount} rows total; the first ${preview.length} are shown here as a preview. ` +
          `The complete result set is in ${spillPath}, one JSON object per line.`,
  });
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  return value;
}
