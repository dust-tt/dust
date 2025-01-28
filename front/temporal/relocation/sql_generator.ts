const DEFAULT_CHUNK_SIZE = 250;

function pgArrayLiteral(arrayValue: any[]): string {
  return (
    "{" +
    arrayValue
      .map((elem) => {
        // Nested array → recurse
        if (Array.isArray(elem)) {
          return pgArrayLiteral(elem);
        }

        // Null or undefined → NULL
        if (elem == null) {
          return "NULL";
        }

        // Convert string numbers back to numbers (for BIGINT arrays from Sequelize)
        // Sequelize returns numbers as strings for BIGINT ARRAY columns.
        if (typeof elem === "string" && /^-?\d+$/.test(elem)) {
          return elem; // No quotes for numbers
        }

        // Regular number/bigint → no quotes
        if (typeof elem === "number" || typeof elem === "bigint") {
          return String(elem);
        }

        // Rest of the cases...
        if (typeof elem === "boolean") {
          return elem ? "true" : "false";
        }

        if (elem instanceof Date) {
          return `"${elem.toISOString()}"`;
        }

        if (typeof elem === "string") {
          return `"${elem.replace(/"/g, '""')}"`;
        }

        return `"${String(elem).replace(/"/g, '""')}"`;
      })
      .join(",") +
    "}"
  );
}

/**
 * Escapes a single value (number, string, boolean, date, array, etc.)
 * to be safely inserted into a Postgres SQL statement.
 */
// TODO: Remove export.
export function formatValue(val: any): string {
  // 1) Handle null / undefined.
  if (val === null || val === undefined) {
    return "NULL";
  }

  // 2) Date => ISO string.
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }

  // 3) Boolean => 'true' / 'false'.
  if (typeof val === "boolean") {
    return val ? "'true'" : "'false'";
  }

  // 4) Array => Postgres array literal
  if (Array.isArray(val)) {
    // If array contains plain objects, treat as JSONB.
    if (
      val.length > 0 &&
      typeof val[0] === "object" &&
      val[0] !== null &&
      !(val[0] instanceof Date) &&
      !Array.isArray(val[0])
    ) {
      return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    }

    return `'${pgArrayLiteral(val)}'`;
  }

  // 5) Plain object → treat as JSON
  if (typeof val === "object") {
    // Convert to JSON string, then escape embedded single quotes
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`; // or ::json
  }

  // 6) Otherwise force it to string
  //    Then escape single quotes (Postgres doubles them: abc'xyz => abc''xyz).
  const strVal = String(val).replace(/'/g, "''");
  return `'${strVal}'`;
}

export function generateTableSQL(
  tableName: string,
  rows: Record<string, any>[],
  options?: {
    onConflict?: "ignore" | "update";
    chunkSize?: number;
  }
) {
  if (rows.length === 0) {
    return [];
  }

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map((col) => `"${col}"`);
  const statements: string[] = [];

  // Process in chunks of 250
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const valuesSets = chunk.map(
      (row) => `(${columns.map((col) => formatValue(row[col])).join(",")})`
    );

    let sql = `INSERT INTO "${tableName}" (${quotedColumns.join(",")}) VALUES ${valuesSets.join(",")}`;

    if (options?.onConflict === "ignore") {
      sql += " ON CONFLICT DO NOTHING";
    }

    statements.push(sql + ";");
  }

  return statements;
}
