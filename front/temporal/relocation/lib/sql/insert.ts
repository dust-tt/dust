const DEFAULT_CHUNK_SIZE = 250;

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
        params.push(row[col]);
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
