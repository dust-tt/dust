import { isArrayOfPlainObjects } from "@app/temporal/relocation/activities/types";

const DEFAULT_CHUNK_SIZE = 250;

// Temporary solution to handle JSONB columns.
const JSONB_COLUMNS = [
  {
    tableName: "agent_configurations",
    columns: ["responseFormat"],
  },
  {
    tableName: "agent_mcp_actions",
    columns: ["augmentedInputs", "toolConfiguration"],
  },
];

export function generateParameterizedInsertStatements(
  tableName: string,
  rows: Record<string, any>[],
  options?: {
    onConflict?: "ignore" | "update";
    chunkSize?: number;
  }
): { sql: string; params: any[] }[] {
  if (rows.length === 0) {
    return [];
  }

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map((col) => `"${col}"`);

  const out: { sql: string; params: any[] }[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const placeholders: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const row of chunk) {
      const rowPlaceholders: string[] = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex++}`);

        // Special case: `autoReadChannelPatterns` is a JSONB column that needs to be stringified.
        if (col === "autoReadChannelPatterns") {
          params.push(JSON.stringify(row[col]));
          continue;
        }

        if (
          JSONB_COLUMNS.some(
            (c) => c.tableName === tableName && c.columns.includes(col)
          ) &&
          (typeof row[col] === "string" ||
            (Array.isArray(row[col]) && row[col].length > 0))
        ) {
          params.push(JSON.stringify(row[col]));
          continue;
        }

        // Array of plain objects are serialized to JSON strings.
        const serialized = isArrayOfPlainObjects(row[col])
          ? JSON.stringify(row[col])
          : row[col];

        params.push(serialized);
      }
      placeholders.push(`(${rowPlaceholders.join(",")})`);
    }

    let sql = `INSERT INTO "${tableName}" (${quotedColumns.join(",")}) VALUES ${placeholders.join(",")}`;

    if (options?.onConflict === "ignore") {
      sql += " ON CONFLICT DO NOTHING";
    }
    sql += ";";

    out.push({ sql, params });
  }

  return out;
}
