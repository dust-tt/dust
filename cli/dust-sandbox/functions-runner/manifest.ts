// Per-database manifest extraction for `dsbx function build` (manifest.v1 contract, see
// design_docs/pod_state_progress/contracts/manifest.v1.md).
//
// A function declares the pod databases it opens in `schema.databases: string[]`. Each declared
// database must have a drizzle schema file at `databases/{db}.db.ts` relative to the function
// source file's directory. This module imports those schema files, collects their exported
// tables, and turns them into DatabaseManifests via drizzle's `getTableConfig`.
//
// Cross-module-instance note: the schema file resolves its own `drizzle-orm` copy (NODE_PATH
// global in the sandbox), while this runner ships an inlined copy. Table detection therefore
// uses drizzle's `is()` (Symbol.for-keyed entityKind), never `instanceof`, and property access
// on foreign column instances goes through duck-typed Reflect helpers.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

export const DB_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Table-name prefixes drizzle-kit's introspection ignores (plus SQLite internals): a table
// named this way would pass build and first reconcile, then be invisible to every subsequent
// reconcile plan — reject it up front.
const RESERVED_TABLE_PREFIXES = [
  "sqlite_",
  "__drizzle",
  "_litestream",
  "_cf_",
  "libsql_",
];

// Model-authored names become plain-object keys in manifests (runner + front + JSONB); these
// keys would collide with Object.prototype machinery.
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeName(
  kind: "table" | "column" | "index",
  name: string,
  where: string
): void {
  if (RESERVED_OBJECT_KEYS.has(name)) {
    throw new ManifestError(
      "database_schema_invalid",
      `${where}: ${kind} name "${name}" is reserved and not allowed in pod databases`
    );
  }
  if (
    kind === "table" &&
    RESERVED_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    throw new ManifestError(
      "database_schema_invalid",
      `${where}: table name "${name}" uses a reserved prefix (${RESERVED_TABLE_PREFIXES.join(", ")}) and is not allowed in pod databases`
    );
  }
}

export type ManifestErrorKind =
  | "databases_declaration_invalid"
  | "database_schema_unresolvable"
  | "database_schema_invalid";

export class ManifestError extends Error {
  readonly kind: ManifestErrorKind;

  constructor(kind: ManifestErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface ManifestColumn {
  type: string;
  mode: string | null;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
}

export interface ManifestIndex {
  unique: boolean;
  columns: string[];
}

export interface ManifestTable {
  columns: Record<string, ManifestColumn>;
  indexes: Record<string, ManifestIndex>;
}

export interface DatabaseManifest {
  schemaFile: string;
  tables: Record<string, ManifestTable>;
}

export interface FunctionManifests {
  version: 1;
  databases: Record<string, DatabaseManifest>;
}

// Column `mode` is the row<->JS (de)serialization contract. Most drizzle sqlite column classes
// carry a `mode` instance property, but some (e.g. text/blob json variants) do not — fall back
// to a columnType-derived map for those.
const MODE_BY_COLUMN_TYPE: Record<string, string> = {
  SQLiteTextJson: "json",
  SQLiteBlobJson: "json",
  SQLiteBlobBuffer: "buffer",
  SQLiteBigInt: "bigint",
  SQLiteNumericNumber: "number",
  SQLiteNumericBigInt: "bigint",
};

function stringProp(obj: object, key: string): string | undefined {
  const value: unknown = Reflect.get(obj, key);
  return typeof value === "string" ? value : undefined;
}

function boolProp(obj: object, key: string): boolean {
  const value: unknown = Reflect.get(obj, key);
  return value === true;
}

function definedProp(obj: object, key: string): boolean {
  const value: unknown = Reflect.get(obj, key);
  return value !== undefined && value !== null;
}

// Reads and validates the `databases` declaration off an already-importable handler module.
// Returns [] when the function declares none.
export async function readDeclaredDatabases(
  handlerPath: string
): Promise<string[]> {
  const mod = await import(handlerPath);
  const schema = mod.schema as { databases?: unknown } | undefined;
  const declared = schema?.databases;
  if (declared === undefined) {
    return [];
  }
  if (
    !Array.isArray(declared) ||
    declared.some((name) => typeof name !== "string")
  ) {
    throw new ManifestError(
      "databases_declaration_invalid",
      "`schema.databases` must be an array of database names"
    );
  }
  const names = declared.filter(
    (name): name is string => typeof name === "string"
  );
  for (const name of names) {
    if (!DB_NAME_REGEX.test(name)) {
      throw new ManifestError(
        "databases_declaration_invalid",
        `invalid database name "${name}": must match ${DB_NAME_REGEX}`
      );
    }
  }
  if (new Set(names).size !== names.length) {
    throw new ManifestError(
      "databases_declaration_invalid",
      "`schema.databases` contains duplicate names"
    );
  }
  return names;
}

// Builds the FunctionManifests for every declared database of a function, resolving each
// `databases/{db}.db.ts` schema file relative to the function source directory.
export async function extractManifests(
  srcDir: string,
  dbNames: string[]
): Promise<FunctionManifests> {
  const databases: Record<string, DatabaseManifest> = Object.create(null);
  for (const name of dbNames) {
    const schemaFile = join("databases", `${name}.db.ts`);
    databases[name] = await extractDatabaseManifestFromFile(
      name,
      schemaFile,
      resolve(srcDir, schemaFile)
    );
  }
  return { version: 1, databases };
}

// Extracts (and validates: FK/CHECK/composite-PK rejections) the manifest of one schema file.
// Also used by `dsbx db reconcile` as its schema-file validation step.
export async function extractDatabaseManifestFromFile(
  dbName: string,
  schemaFile: string,
  schemaPath: string
): Promise<DatabaseManifest> {
  if (!existsSync(schemaPath)) {
    throw new ManifestError(
      "database_schema_unresolvable",
      `database "${dbName}": schema file not found at ${schemaFile} (relative to the function source directory)`
    );
  }

  let mod: Record<string, unknown>;
  try {
    mod = await import(schemaPath);
  } catch (e) {
    throw new ManifestError(
      "database_schema_unresolvable",
      `database "${dbName}": schema file ${schemaFile} failed to import: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  // Null-prototype accumulator: model-authored table names are object keys and must not be
  // able to collide with Object.prototype (defense in depth on top of assertSafeName).
  const tables: Record<string, ManifestTable> = Object.create(null);
  for (const value of Object.values(mod)) {
    if (!is(value, SQLiteTable)) {
      continue;
    }
    const config = getTableConfig(value);
    assertSafeName("table", config.name, `database "${dbName}"`);
    if (tables[config.name] !== undefined) {
      throw new ManifestError(
        "database_schema_invalid",
        `database "${dbName}": table "${config.name}" is exported more than once from ${schemaFile}`
      );
    }
    tables[config.name] = extractTable(dbName, config.name, config);
  }

  if (Object.keys(tables).length === 0) {
    throw new ManifestError(
      "database_schema_invalid",
      `database "${dbName}": schema file ${schemaFile} exports no tables`
    );
  }

  return { schemaFile, tables };
}

type TableConfig = ReturnType<typeof getTableConfig>;

function extractTable(
  dbName: string,
  tableName: string,
  config: TableConfig
): ManifestTable {
  const where = `database "${dbName}", table "${tableName}"`;

  if (config.foreignKeys.length > 0) {
    throw new ManifestError(
      "database_schema_invalid",
      `${where}: foreign keys (.references() / foreignKey()) are not allowed in pod databases — enforce relational integrity in function code instead`
    );
  }
  if (config.checks.length > 0) {
    throw new ManifestError(
      "database_schema_invalid",
      `${where}: CHECK constraints are not allowed in pod databases — validate values in function code instead`
    );
  }

  // Table-level primaryKey(): a single-column declaration folds into that column's primaryKey
  // flag; multiple columns are a composite primary key, which is rejected.
  const tableLevelPkColumns = new Set<string>();
  for (const pk of config.primaryKeys) {
    if (pk.columns.length > 1) {
      throw new ManifestError(
        "database_schema_invalid",
        `${where}: composite primary keys are not allowed in pod databases — use a single id column`
      );
    }
    const column = pk.columns[0];
    if (column !== undefined) {
      tableLevelPkColumns.add(column.name);
    }
  }

  // Null-prototype accumulators: column/index names are model-authored object keys.
  const columns: Record<string, ManifestColumn> = Object.create(null);
  const indexes: Record<string, ManifestIndex> = Object.create(null);

  const addIndex = (name: string, index: ManifestIndex) => {
    assertSafeName("index", name, where);
    if (indexes[name] !== undefined) {
      throw new ManifestError(
        "database_schema_invalid",
        `${where}: duplicate index name "${name}"`
      );
    }
    indexes[name] = index;
  };

  for (const column of config.columns) {
    assertSafeName("column", column.name, where);
    const columnType = stringProp(column, "columnType") ?? "";
    const mode =
      stringProp(column, "mode") ?? MODE_BY_COLUMN_TYPE[columnType] ?? null;
    columns[column.name] = {
      type: column.getSQLType().toLowerCase(),
      mode,
      notNull: column.notNull,
      hasDefault: column.hasDefault || definedProp(column, "onUpdateFn"),
      primaryKey: column.primary || tableLevelPkColumns.has(column.name),
      autoIncrement: boolProp(column, "autoIncrement"),
    };

    // Column-level .unique() normalizes into the indexes map (manifest.v1).
    if (boolProp(column, "isUnique")) {
      const uniqueName =
        stringProp(column, "uniqueName") ??
        `${tableName}_${column.name}_unique`;
      addIndex(uniqueName, { unique: true, columns: [column.name] });
    }
  }

  for (const index of config.indexes) {
    const indexConfig = index.config;
    const columnNames: string[] = [];
    for (const indexed of indexConfig.columns) {
      const columnName = stringProp(indexed, "name");
      if (columnName === undefined) {
        throw new ManifestError(
          "database_schema_invalid",
          `${where}: index "${indexConfig.name}" uses an SQL expression — only plain column indexes are supported in pod databases`
        );
      }
      columnNames.push(columnName);
    }
    addIndex(indexConfig.name, {
      unique: indexConfig.unique,
      columns: columnNames,
    });
  }

  // Table-level unique() constraints also normalize into the indexes map.
  for (const constraint of config.uniqueConstraints) {
    const columnNames = constraint.columns.map((column) => column.name);
    const constraintName =
      stringProp(constraint, "name") ??
      `${tableName}_${columnNames.join("_")}_unique`;
    addIndex(constraintName, { unique: true, columns: columnNames });
  }

  return { columns, indexes };
}
