// `dsbx db query` runner backend: one SQL statement against a live pod database. Expected
// refusals come back as Err (ERR1), never thrown.
//
// SELECT and DML (INSERT/UPDATE/DELETE/REPLACE, optionally WITH) are allowed; everything else
// — DDL, PRAGMA, ATTACH, transaction control — is refused, so the schema can only evolve
// through reconcile and the file's WAL setup cannot be broken from a query. Writes run in one
// transaction with a schema-version re-check as a second barrier behind the keyword gate.
// Small results return entirely in the stdout envelope; once a result crosses the inline
// bounds, the COMPLETE result set is written to a spill file (one JSON object per line) and
// the envelope carries the file path, a note saying so, and the first rows as a preview.
// Nothing is ever silently dropped. Spill files land in the sandbox's /tmp and live as long
// as the sandbox does — no cleanup pass exists.

import { Database, type Statement } from "bun:sqlite";
import { closeSync, existsSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DB_BUSY_TIMEOUT_MS, DbCommandError } from "./db_common.ts";
import { Err, Ok, type Result } from "./result.ts";

// Inline envelope bounds: a result within both stays entirely on stdout; beyond either, it
// spills to a file. Bounds exist for stdout (which lands in the caller's context), not for
// the result set — the spill file always holds every row.
export const QUERY_INLINE_ROW_CAP = 100;
export const QUERY_INLINE_PAYLOAD_CAP_BYTES = 100_000;

// First keyword of an allowed statement. WITH can only precede SELECT/INSERT/UPDATE/DELETE
// and VALUES is a bare row constructor, so nothing here can carry DDL: SQLite triggers cannot
// contain DDL, and direct sqlite_master edits need the (blocked) writable_schema pragma.
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
  // Rows affected, for statements that return no columns (plain INSERT/UPDATE/DELETE);
  // null for result-returning statements.
  changes: number | null;
  // Set when the result crossed the inline bounds: `rows` is then a preview and the complete
  // result set is at this path, one JSON object per line.
  results_file: string | null;
  note: string | null;
}

export function runQuery(
  dbPath: string,
  sql: string
): Result<QueryOutcome, DbCommandError> {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return new Err(
      new DbCommandError("empty_sql", "no SQL statement provided on stdin")
    );
  }

  // Keyword gate BEFORE preparing: some pragmas take effect during SQL compilation
  // (https://sqlite.org/pragma.html), so the raw text is gated first. A leading comment
  // defeats the match and fails closed.
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

  const opened = openReadwrite(dbPath);
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

    if (keyword === "select" || keyword === "values") {
      return collectRows(statement);
    }

    // One transaction per write statement, with a schema-version re-check as the second
    // barrier behind the keyword gate: a statement that still changed the schema rolls back
    // instead of committing. WITH-prefixed reads also land here and pay the write lock for
    // their duration — accepted, distinguishing them would mean parsing the statement.
    db.exec("BEGIN IMMEDIATE;");
    let result: Result<QueryOutcome, DbCommandError>;
    try {
      const versionBefore = schemaVersion(db);
      result =
        statement.columnNames.length === 0
          ? runChanges(statement)
          : collectRows(statement);
      if (result.isOk() && schemaVersion(db) !== versionBefore) {
        result = new Err(
          new DbCommandError(
            "disallowed_statement",
            "the statement changed the database schema; schema changes go through reconcile"
          )
        );
      }
    } catch (e) {
      // Unexpected (collectRows/runChanges wrap their own failures): rollback and rethrow.
      rollbackQuietly(db);
      throw e;
    }
    if (result.isErr()) {
      rollbackQuietly(db);
      return result;
    }
    db.exec("COMMIT;");
    return result;
  } finally {
    db.close();
  }
}

function rollbackQuietly(db: Database): void {
  try {
    db.exec("ROLLBACK;");
  } catch {
    // Some failures roll the transaction back on their own; the original error is the one
    // to surface.
  }
}

// Open read-write, must-exist: databases are only ever created by reconcile.
function openReadwrite(dbPath: string): Result<Database, DbCommandError> {
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
    // The file exists, so a failed open is infrastructure (permissions, corruption), not a
    // correctable input.
    return new Err(
      new DbCommandError(
        "internal",
        `cannot open database at ${dbPath}: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    );
  }
  db.exec(`PRAGMA busy_timeout = ${DB_BUSY_TIMEOUT_MS};`);
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

// Execute a no-result statement (plain INSERT/UPDATE/DELETE) and report the affected rows.
function runChanges(
  statement: Statement
): Result<QueryOutcome, DbCommandError> {
  let changes: number;
  try {
    changes = Number(statement.run().changes);
  } catch (e) {
    return new Err(
      new DbCommandError(
        "query_failed",
        e instanceof Error ? e.message : String(e)
      )
    );
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
        // Crossed the inline bounds: from here on the full result set (including the
        // preview rows already seen) streams to the spill file.
        spillPath = join(tmpdir(), `dsbx-query-${crypto.randomUUID()}.jsonl`);
        spillFd = openSync(spillPath, "w");
        for (const line of previewJson) {
          writeSync(spillFd, `${line}\n`);
        }
      }
      writeSync(spillFd, `${rowJson}\n`);
    }
  } catch (e) {
    return new Err(
      new DbCommandError(
        "query_failed",
        e instanceof Error ? e.message : String(e)
      )
    );
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

// A bun:sqlite row value is one of SQLite's five storage classes as surfaced by bun:sqlite
// (https://bun.com/docs/api/sqlite#datatypes, https://sqlite.org/datatype3.html): NULL ->
// null, INTEGER -> bigint (the database is opened with safeIntegers), REAL -> number,
// TEXT -> string, BLOB -> Uint8Array. JSON covers all but two of them:
// - INTEGER: back to a JS number when exact, decimal string beyond 2^53 (JSON parsers read
//   large number literals lossily, so the string is the faithful form);
// - BLOB: base64 string.
// There are no other cases — SQLite has no further storage classes (no datetime, etc.).
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
