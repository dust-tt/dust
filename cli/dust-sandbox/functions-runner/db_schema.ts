// `dsbx db schema` runner backend: regenerate a drizzle `{db}.db.ts` schema file from a live
// pod database.
//
// Introspection is PRAGMA-based (sqlite_master + table_xinfo + index_list/index_info):
// drizzle-kit's `pull` requires a better-sqlite3/@libsql driver and cannot reuse bun:sqlite
// (E2 verdict). Column modes (timestamp/json/boolean/...) are a drizzle-level concept that
// SQLite does not store — they are NOT regenerated here; they live in the published
// functions' stored manifests.

import type { LiveColumn, LiveTable } from "./db_common.ts";
import { introspectLiveTables, openReadonly } from "./db_common.ts";

const GENERATED_HEADER = `// Regenerated from the live database by \`dsbx db schema\`.
// NOTE: column modes (e.g. { mode: "timestamp" | "json" | "boolean" }) are not stored in
// SQLite and are NOT recovered here — re-add the modes your functions declare in their
// published manifests before using this file as the shared schema source.
`;

export function generateSchemaFileText(dbPath: string): string {
  const db = openReadonly(dbPath);
  try {
    const tables = introspectLiveTables(db);
    const usedImports = new Set<string>(["sqliteTable"]);
    const tableBlocks = tables.map((table) =>
      generateTableBlock(table, usedImports)
    );

    const sqliteCoreImports = [...usedImports]
      .filter((name) => name !== "sql")
      .sort()
      .join(", ");
    const importLines = [
      `import { ${sqliteCoreImports} } from "drizzle-orm/sqlite-core";`,
    ];
    if (usedImports.has("sql")) {
      importLines.unshift(`import { sql } from "drizzle-orm";`);
    }

    return [
      GENERATED_HEADER,
      importLines.join("\n"),
      "",
      tableBlocks.join("\n\n"),
      "",
    ].join("\n");
  } finally {
    db.close();
  }
}

function generateTableBlock(
  table: LiveTable,
  usedImports: Set<string>
): string {
  const pkColumns = table.columns
    .filter((column) => column.pkOrdinal > 0 && column.hidden === 0)
    .sort((a, b) => a.pkOrdinal - b.pkOrdinal);
  // Column-level .primaryKey() implies NOT NULL in drizzle's schema model, but a live
  // non-INTEGER `PRIMARY KEY` column is nullable in SQLite (legacy quirk) — regenerating it
  // inline would make drizzle-kit plan a table recreate. Only the INTEGER single-pk (rowid
  // alias, which drizzle-kit treats as equivalent) regenerates inline; every other primary
  // key becomes a table-level primaryKey({ ... }).
  const singlePk =
    pkColumns.length === 1 &&
    pkColumns[0] !== undefined &&
    builderForDeclaredType(pkColumns[0].declaredType) === "integer"
      ? pkColumns[0]
      : undefined;
  const singlePkName = singlePk?.name;
  const hasAutoIncrement = /\bAUTOINCREMENT\b/i.test(table.createSql);

  // Single-column UNIQUE-constraint auto-indexes render as column-level .unique(); everything
  // else renders in the table-level extras list.
  const uniqueSingleColumns = new Set<string>();
  const extras: string[] = [];

  for (const index of table.indexes) {
    if (index.origin === "pk") {
      continue;
    }
    const memberNames = index.columns.filter(
      (name): name is string => name !== null
    );
    if (memberNames.length !== index.columns.length) {
      extras.push(
        `// index ${JSON.stringify(index.name)} uses rowid or an expression and cannot be regenerated`
      );
      continue;
    }
    if (index.origin === "u") {
      if (memberNames.length === 1 && memberNames[0] !== undefined) {
        uniqueSingleColumns.add(memberNames[0]);
      } else {
        // Multi-column UNIQUE constraint: auto-index names (sqlite_autoindex_*) are reserved,
        // regenerate as an unnamed table-level unique().
        usedImports.add("unique");
        extras.push(
          `unique().on(${memberNames.map((name) => `t.${propertyName(name)}`).join(", ")})`
        );
      }
      continue;
    }
    const builder = index.unique ? "uniqueIndex" : "index";
    usedImports.add(builder);
    extras.push(
      `${builder}(${JSON.stringify(index.name)}).on(${memberNames
        .map((name) => `t.${propertyName(name)}`)
        .join(", ")})`
    );
  }

  if (singlePk === undefined && pkColumns.length > 0) {
    usedImports.add("primaryKey");
    extras.push(
      `primaryKey({ columns: [${pkColumns
        .map((column) => `t.${propertyName(column.name)}`)
        .join(", ")}] })`
    );
  }

  const columnLines = table.columns
    .filter((column) => column.hidden === 0)
    .map((column) =>
      generateColumnLine(column, {
        isSinglePk: column.name === singlePkName,
        autoIncrement: column.name === singlePkName && hasAutoIncrement,
        unique: uniqueSingleColumns.has(column.name),
        usedImports,
      })
    );

  const exportName = propertyName(table.name);
  const head = `export const ${exportName} = sqliteTable(\n  ${JSON.stringify(table.name)},\n  {\n${columnLines.join("\n")}\n  }`;
  if (extras.length === 0) {
    return `${head}\n);`;
  }
  return `${head},\n  (t) => [\n${extras.map((extra) => `    ${extra},`).join("\n")}\n  ]\n);`;
}

function generateColumnLine(
  column: LiveColumn,
  {
    isSinglePk,
    autoIncrement,
    unique,
    usedImports,
  }: {
    isSinglePk: boolean;
    autoIncrement: boolean;
    unique: boolean;
    usedImports: Set<string>;
  }
): string {
  const builder = builderForDeclaredType(column.declaredType);
  usedImports.add(builder);

  let line = `    ${propertyName(column.name)}: ${builder}(${JSON.stringify(column.name)})`;
  if (isSinglePk) {
    line += autoIncrement
      ? ".primaryKey({ autoIncrement: true })"
      : ".primaryKey()";
  }
  // INTEGER PRIMARY KEY is NOT NULL by construction; drizzle's .primaryKey() implies notNull.
  if (column.notNull && !isSinglePk) {
    line += ".notNull()";
  }
  if (unique) {
    line += ".unique()";
  }
  if (column.defaultValue !== null && !isSinglePk) {
    line += `.default(${renderDefault(column.defaultValue, usedImports)})`;
  }
  return `${line},`;
}

// SQLite type-affinity rules (https://sqlite.org/datatype3.html#determination_of_column_affinity)
// mapped onto drizzle sqlite-core builders.
function builderForDeclaredType(declaredType: string): string {
  const upper = declaredType.toUpperCase();
  if (upper.includes("INT")) {
    return "integer";
  }
  if (
    upper.includes("CHAR") ||
    upper.includes("CLOB") ||
    upper.includes("TEXT")
  ) {
    return "text";
  }
  if (upper === "" || upper.includes("BLOB")) {
    return "blob";
  }
  if (
    upper.includes("REAL") ||
    upper.includes("FLOA") ||
    upper.includes("DOUB")
  ) {
    return "real";
  }
  return "numeric";
}

// PRAGMA table_xinfo reports defaults as SQL text: numbers verbatim, strings quoted, and
// keywords/expressions raw. Renders literals natively and falls back to a sql`` template.
function renderDefault(defaultSql: string, usedImports: Set<string>): string {
  const trimmed = defaultSql.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  // Boolean-mode columns render `DEFAULT true|false`; emit the bare literal so the DDL text
  // (and thus the drizzle-kit push plan) stays identical.
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return JSON.stringify(trimmed.slice(1, -1).replaceAll("''", "'"));
  }
  usedImports.add("sql");
  return `sql\`${trimmed.replaceAll("`", "\\`")}\``;
}

// Table/column names become TS identifiers. Pod-created names already match
// ^[a-z][a-z0-9_]*$; anything else (hand-made databases) is sanitized.
function propertyName(sqlName: string): string {
  const sanitized = sqlName.replaceAll(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}
