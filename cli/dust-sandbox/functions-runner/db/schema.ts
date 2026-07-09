// `dsbx db schema` runner backend: regenerate a drizzle `{db}.db.ts` schema file from a live
// pod database.
//
// This would ideally be drizzle-kit `pull`, but at drizzle-kit 0.31.10 none of that pipeline
// is reachable here: the TS codegen (`schemaToTypeScript`) is bundled only into the CLI
// binary (bin.cjs, not a package export), the database introspection (`fromDatabase` /
// `sqliteIntrospect`) is internal to the api bundle and absent from the `drizzle-kit/api`
// export list, and the CLI itself cannot open a database through bun:sqlite (it needs a
// better-sqlite3/@libsql driver, which the sandbox image does not ship). So introspection is
// PRAGMA-based (sqlite_master + table_xinfo + index_list/index_info, shared with reconcile's
// destructive pre-check) and the generation below mirrors pull's output as closely as it can.
// Its correctness contract is the round-trip test: a regenerated file must reconcile to zero
// statements against the database it came from.
//
// Column modes (timestamp/json/boolean/...) are a drizzle-level concept that SQLite does not
// store — they are NOT regenerated here; they only exist in the authored schema files.

import { Ok, type Result } from "../result.ts";
import type { LiveColumn, LiveTable } from "../types/db.ts";
import type { DbCommandError } from "./common.ts";
import { introspectLiveTables, openReadonly } from "./common.ts";

const GENERATED_HEADER = `// Generated from the live database by \`dsbx db schema\`.
// Column modes (e.g. { mode: "timestamp" | "json" | "boolean" }) are not stored in SQLite,
// so none appear here; re-declare them by hand from the original schema file or the
// functions' code.
`;

export function generateSchemaFileText(
  dbPath: string
): Result<string, DbCommandError> {
  const opened = openReadonly(dbPath);
  if (opened.isErr()) {
    return opened;
  }
  const db = opened.value;
  try {
    const tables = introspectLiveTables(db);
    const blocks = tables.map((table) => generateTableBlock(table));

    const usedImports = new Set<string>(["sqliteTable"]);
    for (const block of blocks) {
      for (const name of block.imports) {
        usedImports.add(name);
      }
    }

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

    return new Ok(
      [
        GENERATED_HEADER,
        importLines.join("\n"),
        "",
        blocks.map((block) => block.text).join("\n\n"),
        "",
      ].join("\n")
    );
  } finally {
    db.close();
  }
}

interface Generated {
  text: string;
  imports: string[];
}

function generateTableBlock(table: LiveTable): Generated {
  const imports: string[] = [];
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
  // Text sniff over this table's CREATE TABLE DDL: SQLite exposes AUTOINCREMENT nowhere else.
  // Only consulted for the single INTEGER pk; a false positive would need another identifier
  // in the same DDL to contain the bare keyword.
  const hasAutoIncrement = /\bAUTOINCREMENT\b/i.test(table.createSql);

  const extras: string[] = [];

  for (const index of table.indexes) {
    if (index.origin === "pk") {
      continue;
    }
    if (index.origin === "u") {
      // UNIQUE constraints live in the CREATE TABLE DDL and are rejected by build/reconcile
      // (pod-created databases never have them) — emit a comment instead of a declaration
      // reconcile would refuse.
      extras.push(
        `// UNIQUE constraint ${JSON.stringify(index.name)} cannot be redeclared in pod schemas — use uniqueIndex() on new tables instead`
      );
      continue;
    }
    if (index.partial) {
      // The WHERE clause of a partial index is not introspected; a regenerated index without
      // it would be a different index.
      extras.push(
        `// partial index ${JSON.stringify(index.name)} (CREATE INDEX ... WHERE) cannot be regenerated`
      );
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
    const builder = index.unique ? "uniqueIndex" : "index";
    imports.push(builder);
    extras.push(
      `${builder}(${JSON.stringify(index.name)}).on(${memberNames
        .map((name) => `t.${propertyName(name)}`)
        .join(", ")})`
    );
  }

  if (singlePk === undefined && pkColumns.length > 0) {
    imports.push("primaryKey");
    extras.push(
      `primaryKey({ columns: [${pkColumns
        .map((column) => `t.${propertyName(column.name)}`)
        .join(", ")}] })`
    );
  }

  const columnLines: string[] = [];
  for (const column of table.columns) {
    if (column.hidden !== 0) {
      continue;
    }
    const generated = generateColumnLine(column, {
      isSinglePk: column.name === singlePkName,
      autoIncrement: column.name === singlePkName && hasAutoIncrement,
    });
    columnLines.push(generated.text);
    imports.push(...generated.imports);
  }

  const exportName = exportIdentifier(table.name);
  const head = `export const ${exportName} = sqliteTable(\n  ${JSON.stringify(table.name)},\n  {\n${columnLines.join("\n")}\n  }`;
  const text =
    extras.length === 0
      ? `${head}\n);`
      : `${head},\n  (t) => [\n${extras.map((extra) => `    ${extra},`).join("\n")}\n  ]\n);`;
  return { text, imports };
}

function generateColumnLine(
  column: LiveColumn,
  {
    isSinglePk,
    autoIncrement,
  }: {
    isSinglePk: boolean;
    autoIncrement: boolean;
  }
): Generated {
  const imports: string[] = [];
  const builder = builderForDeclaredType(column.declaredType);
  imports.push(builder);

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
  if (column.defaultValue !== null && !isSinglePk) {
    const rendered = renderDefault(column.defaultValue);
    if (rendered.needsSql) {
      imports.push("sql");
    }
    line += `.default(${rendered.text})`;
  }
  return { text: `${line},`, imports };
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
function renderDefault(defaultSql: string): {
  text: string;
  needsSql: boolean;
} {
  const trimmed = defaultSql.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { text: trimmed, needsSql: false };
  }
  // Boolean-mode columns render `DEFAULT true|false`; emit the bare literal so the DDL text
  // (and thus the drizzle-kit push plan) stays identical.
  if (/^(true|false)$/i.test(trimmed)) {
    return { text: trimmed.toLowerCase(), needsSql: false };
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return {
      text: JSON.stringify(trimmed.slice(1, -1).replaceAll("''", "'")),
      needsSql: false,
    };
  }
  return { text: `sql\`${trimmed.replaceAll("`", "\\`")}\``, needsSql: true };
}

// JS/TS reserved words cannot be `export const` identifiers (they are fine as object keys
// and property accesses, so propertyName does not need this).
const JS_RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function exportIdentifier(tableName: string): string {
  const name = propertyName(tableName);
  return JS_RESERVED_WORDS.has(name) ? `_${name}` : name;
}

// Table/column names become TS identifiers. Names outside ^[A-Za-z_$][A-Za-z0-9_$]*$ (possible
// in hand-made databases; pod-created names match the db/table contracts) are sanitized.
function propertyName(sqlName: string): string {
  const sanitized = sqlName.replaceAll(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}
