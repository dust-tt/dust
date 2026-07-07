// `dsbx db query` runner backend: read-only SQL against a live pod database.
//
// The database is opened read-only AND with `PRAGMA query_only = ON` (defense in depth), so
// any write attempt fails. Rows are returned in the stdout envelope, capped (+ truncated flag):
// this backs the pod_databases `query` MCP tool.

import { DbCommandError, openReadonly } from "./db_common.ts";

export const QUERY_ROW_CAP = 1000;
// Total payload cap alongside the row cap: a single crafted large row must not buffer an
// unbounded result through the runner into front memory.
export const QUERY_PAYLOAD_CAP_BYTES = 1024 * 1024;

export interface QuerySuccess {
  ok: true;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
}

// bun:sqlite's query()/prepare() compiles only the FIRST statement and silently ignores the
// rest, so multi-statement input would return partial results with no error. v1 limitation:
// reject it up front with a pragmatic top-level-';' scan (quotes respected; comments containing
// ';' after a statement are also rejected — send a single clean statement).
function assertSingleStatement(sql: string): void {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (inSingle) {
      if (char === "'") {
        inSingle = false;
      }
    } else if (inDouble) {
      if (char === '"') {
        inDouble = false;
      }
    } else if (char === "'") {
      inSingle = true;
    } else if (char === '"') {
      inDouble = true;
    } else if (char === ";" && sql.slice(i + 1).trim().length > 0) {
      throw new DbCommandError(
        "query_failed",
        "multiple SQL statements are not supported; send a single statement"
      );
    }
  }
}

export function queryReadonly(dbPath: string, sql: string): QuerySuccess {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    throw new DbCommandError("empty_sql", "no SQL statement provided on stdin");
  }
  assertSingleStatement(trimmed);

  const db = openReadonly(dbPath);
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

    const rows: Record<string, unknown>[] = [];
    let truncated = false;
    let payloadBytes = 0;
    try {
      for (const row of statement.iterate()) {
        if (rows.length >= QUERY_ROW_CAP) {
          truncated = true;
          break;
        }
        const sanitized = sanitizeRow(row);
        const rowBytes = Buffer.byteLength(JSON.stringify(sanitized), "utf8");
        if (rowBytes > QUERY_PAYLOAD_CAP_BYTES) {
          throw new DbCommandError(
            "query_failed",
            `a single row exceeds the ${QUERY_PAYLOAD_CAP_BYTES}-byte payload cap; select fewer or smaller columns`
          );
        }
        if (payloadBytes + rowBytes > QUERY_PAYLOAD_CAP_BYTES) {
          truncated = true;
          break;
        }
        payloadBytes += rowBytes;
        rows.push(sanitized);
      }
    } catch (e) {
      throw new DbCommandError(
        "query_failed",
        e instanceof Error ? e.message : String(e)
      );
    }

    return {
      ok: true,
      columns: statement.columnNames,
      rows,
      row_count: rows.length,
      truncated,
    };
  } finally {
    db.close();
  }
}

// Rows must survive JSON.stringify: blobs become base64 strings, bigints (safeIntegers off, so
// only via user-defined functions) become decimal strings.
function sanitizeRow(row: unknown): Record<string, unknown> {
  if (typeof row !== "object" || row === null) {
    return { value: sanitizeValue(row) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = sanitizeValue(value);
  }
  return out;
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
