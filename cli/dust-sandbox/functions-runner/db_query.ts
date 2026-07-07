// `dsbx db query` runner backend: read-only SQL against a live pod database.
//
// The database is opened read-only AND with `PRAGMA query_only = ON` (defense in depth), so
// any write attempt fails. Small results return entirely in the stdout envelope; once a result
// crosses the inline bounds, the COMPLETE result set is written to a spill file (one JSON
// object per line) and the envelope carries the file path, a note saying so, and the first
// rows as a preview. Nothing is ever silently dropped.

import { closeSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DbCommandError, openReadonly } from "./db_common.ts";

// Inline envelope bounds: a result within both stays entirely on stdout; beyond either, it
// spills to a file. Bounds exist for stdout (which lands in the caller's context), not for
// the result set — the spill file always holds every row.
export const QUERY_INLINE_ROW_CAP = 100;
export const QUERY_INLINE_PAYLOAD_CAP_BYTES = 100_000;

export interface QuerySuccess {
  ok: true;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  // Set when the result crossed the inline bounds: `rows` is then a preview and the complete
  // result set is at this path, one JSON object per line.
  results_file: string | null;
  note: string | null;
}

export function queryReadonly(dbPath: string, sql: string): QuerySuccess {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    throw new DbCommandError("empty_sql", "no SQL statement provided on stdin");
  }

  const db = openReadonly(dbPath, { safeIntegers: true });
  try {
    let statement;
    try {
      statement = db.query(trimmed);
    } catch (e) {
      throw new DbCommandError(
        "query_failed",
        e instanceof Error ? e.message : String(e)
      );
    }

    // bun:sqlite compiles only the FIRST statement and never executes what follows, so a
    // multi-statement script would silently return partial results. Instead of parsing SQL
    // ourselves, surface SQLite's own parse boundary: Statement.toString() is the compiled
    // statement's text, so any non-whitespace input beyond it is a second statement. (With
    // bound parameters toString() diverges from the source and the check fails open — our
    // parameterless API never binds any.)
    const compiled = statement.toString();
    if (
      trimmed.startsWith(compiled) &&
      trimmed.slice(compiled.length).trim().length > 0
    ) {
      throw new DbCommandError(
        "query_failed",
        "multiple SQL statements are not supported; send a single statement"
      );
    }

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
            previewBytes + rowJson.length <= QUERY_INLINE_PAYLOAD_CAP_BYTES
          ) {
            preview.push(JSON.parse(rowJson));
            previewBytes += rowJson.length;
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
      if (e instanceof DbCommandError) {
        throw e;
      }
      throw new DbCommandError(
        "query_failed",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      if (spillFd !== null) {
        closeSync(spillFd);
      }
    }

    return {
      ok: true,
      columns: statement.columnNames,
      rows: preview,
      row_count: rowCount,
      results_file: spillPath,
      note:
        spillPath === null
          ? null
          : `${rowCount} rows total; the first ${preview.length} are shown here as a preview. ` +
            `The complete result set is in ${spillPath}, one JSON object per line.`,
    };
  } finally {
    db.close();
  }
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
