import { Database, type Statement } from "bun:sqlite";
import { existsSync } from "node:fs";
import { Err, Ok, type Result } from "#result.ts";
import { applyWritePragmas, DbCommandError } from "./common.ts";

export const QUERY_ROW_CAP = 100;
export const QUERY_PAYLOAD_CAP_BYTES = 100_000;

export interface QueryOutcome {
  columns: string[];
  rows: Record<string, unknown>[];
  // True when the statement produced rows beyond the caps that `rows` does not hold.
  truncated: boolean;
  changes: number | null;
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

  // No statement-type allowlist: the guards below subsume it. The single-statement check rejects a
  // trailing statement, so a stateful setup can't be paired with a follow-up that uses it — not
  // `PRAGMA writable_schema=ON; UPDATE sqlite_master ...`, not `ATTACH ...; SELECT ... FROM other`.
  // BEGIN IMMEDIATE makes VACUUM/BEGIN/`PRAGMA journal_mode` error out (they can't run inside a
  // transaction), and the schema_version re-check rolls back any DDL. A lone connection-scoped
  // pragma or ATTACH resets when the connection closes, so on its own it changes nothing.
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
    // re-check refuses DDL behaviorally: anything that moved the schema is turned into an Err and
    // never committed; a read leaves the version untouched. BEGIN IMMEDIATE means a read holds the
    // write lock for its duration — fine for a single-writer per-pod database, and the price of not
    // branching on a read/write guess that bun gives us no reliable way to make.
    db.exec("BEGIN IMMEDIATE;");
    const versionBefore = schemaVersion(db);
    let result = execute(statement);
    if (result.isOk() && schemaVersion(db) !== versionBefore) {
      result = new Err(
        new DbCommandError(
          "disallowed_statement",
          "the statement changed the database schema; DDL is forbidden in query mode"
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
// its rows through collectRows up to the caps. columnNames is the discriminator, so
// `INSERT … RETURNING` correctly returns its rows.
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
    truncated: false,
    changes,
    note: null,
  });
}

/**
 * @cc [owner:davidebbo,label:product;performance] bounded-query-results
 * `rows` MUST hold at most `QUERY_ROW_CAP` rows and at most `QUERY_PAYLOAD_CAP_BYTES` of their
 * JSON. The first row that would cross either cap MUST be left out and no later row MUST be read
 * from the statement. Whenever a row was left out, `truncated` MUST be true and `note` MUST tell
 * the caller how to narrow the query; otherwise both MUST be false and null. Result rows MUST NOT
 * be written anywhere other than the returned envelope.
 */
function collectRows(
  statement: Statement
): Result<QueryOutcome, DbCommandError> {
  const rows: Record<string, unknown>[] = [];
  let payloadBytes = 0;
  let truncated = false;
  try {
    for (const row of statement.iterate()) {
      const rowJson = JSON.stringify(row, jsonReplacer);
      const rowBytes = Buffer.byteLength(rowJson, "utf8");
      if (
        rows.length >= QUERY_ROW_CAP ||
        payloadBytes + rowBytes > QUERY_PAYLOAD_CAP_BYTES
      ) {
        truncated = true;
        break;
      }
      rows.push(JSON.parse(rowJson));
      payloadBytes += rowBytes;
    }
  } catch (e) {
    return new Err(executionError(e));
  } finally {
    // Leaving the iterator early keeps the statement stepping, and an in-progress write
    // statement (`INSERT … RETURNING`) blocks the COMMIT that follows. Finalizing ends it.
    statement.finalize();
  }

  return new Ok({
    columns: statement.columnNames,
    rows,
    truncated,
    changes: null,
    note: truncated
      ? `Result truncated to the first ${rows.length} rows (limit: ${QUERY_ROW_CAP} rows or ` +
        `${QUERY_PAYLOAD_CAP_BYTES} bytes). Narrow the query with WHERE, LIMIT/OFFSET, or fewer ` +
        "and shorter columns to see the rest."
      : null,
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
