import type {
  DatabaseTableEntry,
  LiveDatabaseEntry,
} from "@app/lib/api/sandbox_functions/dsbx_db";

export type GetPodDatabasesResponseBody = {
  databases: LiveDatabaseEntry[];
};

export type GetPodDatabaseTablesResponseBody = {
  tables: DatabaseTableEntry[];
};

export type GetPodDatabaseSchemaResponseBody = {
  schema: string;
};

export type GetPodTableRowsResponseBody = {
  columns: string[];
  rows: Record<string, unknown>[];
  hasMore: boolean;
};

export type PostPodDatabaseQueryResponseBody = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** Rows affected, for a statement that returns no columns; null for a result-returning one. */
  changes: number | null;
  /** Set when the result crossed the runner's inline bounds and `rows` is only a preview. */
  note: string | null;
};
