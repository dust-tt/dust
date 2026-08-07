/**
 * Wire types for the pod databases routes. These live here rather than next to the `dsbx db`
 * helpers because the browse UI needs them: `lib/api/sandbox_functions/dsbx_db` reaches for
 * node:crypto, Redis and the sandbox lifecycle, so client code must never import from it.
 */

/** Max rows a single browse page may request; keeps every page inside the runner's inline cap. */
export const MAX_TABLE_ROWS_PAGE_SIZE = 50;

export interface LiveDatabaseEntry {
  name: string;
  sizeBytes: number;
}

export interface DatabaseTableEntry {
  name: string;
  rowCount: number;
}

export interface TableRowsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  hasMore: boolean;
}

export type GetPodDatabasesResponseBody = {
  databases: LiveDatabaseEntry[];
};

export type GetPodDatabaseTablesResponseBody = {
  tables: DatabaseTableEntry[];
};

export type GetPodDatabaseSchemaResponseBody = {
  schema: string;
};

export type GetPodTableRowsResponseBody = TableRowsResult;

export type PostPodDatabaseQueryResponseBody = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** Rows affected, for a statement that returns no columns; null for a result-returning one. */
  changes: number | null;
  /** Set when the result crossed the runner's inline bounds and `rows` is only a preview. */
  note: string | null;
};
