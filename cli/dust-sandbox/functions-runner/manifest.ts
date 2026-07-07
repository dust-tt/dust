// Per-database manifest extraction for `dsbx function build` (manifest.v1).
//
// A function declares the pod databases it opens in `schema.databases: string[]`. Each declared
// database must have a drizzle schema file at `databases/{db}.db.ts` relative to the function
// source file's directory. This module imports those schema files, collects their exported
// tables, and turns them into DatabaseManifests via drizzle's `getTableConfig`.
// Validation failures are returned as `ManifestResult` error envelopes, never thrown.
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

export type ManifestErrorKind =
  | "databases_declaration_invalid"
  | "database_schema_unresolvable"
  | "database_schema_invalid";

export interface ManifestError {
  kind: ManifestErrorKind;
  message: string;
}

export type ManifestResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ManifestError };

function err(
  kind: ManifestErrorKind,
  message: string
): { ok: false; error: ManifestError } {
  return { ok: false, error: { kind, message } };
}

function safeNameError(
  kind: "table" | "column" | "index",
  name: string,
  where: string
): ManifestError | null {
  if (RESERVED_OBJECT_KEYS.has(name)) {
    return {
      kind: "database_schema_invalid",
      message: `${where}: ${kind} name "${name}" is reserved and not allowed in pod databases`,
    };
  }
  if (
    kind === "table" &&
    RESERVED_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    return {
      kind: "database_schema_invalid",
      message: `${where}: table name "${name}" uses a reserved prefix (${RESERVED_TABLE_PREFIXES.join(", ")}) and is not allowed in pod databases`,
    };
  }
  return null;
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

export interface FunctionStateManifest {
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
): Promise<ManifestResult<string[]>> {
  const mod = await import(handlerPath);
  const schema = mod.schema as { databases?: unknown } | undefined;
  const declared = schema?.databases;
  if (declared === undefined) {
    return { ok: true, value: [] };
  }
  if (
    !Array.isArray(declared) ||
    declared.some((name) => typeof name !== "string")
  ) {
    return err(
      "databases_declaration_invalid",
      "`schema.databases` must be an array of database names"
    );
  }
  const names = declared.filter(
    (name): name is string => typeof name === "string"
  );
  for (const name of names) {
    if (!DB_NAME_REGEX.test(name)) {
      return err(
        "databases_declaration_invalid",
        `invalid database name "${name}": must match ${DB_NAME_REGEX}`
      );
    }
  }
  if (new Set(names).size !== names.length) {
    return err(
      "databases_declaration_invalid",
      "`schema.databases` contains duplicate names"
    );
  }
  return { ok: true, value: names };
}

// Builds the FunctionStateManifest for every declared database of a function, resolving each
// `databases/{db}.db.ts` schema file relative to the function source directory.
export async function extractManifests(
  srcDir: string,
  dbNames: string[]
): Promise<ManifestResult<FunctionStateManifest>> {
  const databases: Record<string, DatabaseManifest> = Object.create(null);
  for (const name of dbNames) {
    const schemaFile = join("databases", `${name}.db.ts`);
    const manifest = await extractDatabaseManifestFromFile(
      name,
      schemaFile,
      resolve(srcDir, schemaFile)
    );
    if (!manifest.ok) {
      return manifest;
    }
    databases[name] = manifest.value;
  }
  return { ok: true, value: { version: 1, databases } };
}

// Extracts (and validates: FK/CHECK/UNIQUE-constraint/composite-PK rejections) the manifest of
// one schema file. Also used by `dsbx db reconcile` as its schema-file validation step.
export async function extractDatabaseManifestFromFile(
  dbName: string,
  schemaFile: string,
  schemaPath: string
): Promise<ManifestResult<DatabaseManifest>> {
  if (!existsSync(schemaPath)) {
    return err(
      "database_schema_unresolvable",
      `database "${dbName}": schema file not found at ${schemaFile} (relative to the function source directory)`
    );
  }

  // The schema file is model-authored code: importing it can fail arbitrarily.
  let mod: Record<string, unknown>;
  try {
    mod = await import(schemaPath);
  } catch (e) {
    return err(
      "database_schema_unresolvable",
      `database "${dbName}": schema file ${schemaFile} failed to import: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  // Null-prototype accumulator: model-authored table names are object keys and must not be
  // able to collide with Object.prototype (defense in depth on top of safeNameError).
  const tables: Record<string, ManifestTable> = Object.create(null);
  for (const value of Object.values(mod)) {
    if (!is(value, SQLiteTable)) {
      continue;
    }
    const config = getTableConfig(value);
    const nameError = safeNameError(
      "table",
      config.name,
      `database "${dbName}"`
    );
    if (nameError !== null) {
      return { ok: false, error: nameError };
    }
    if (tables[config.name] !== undefined) {
      return err(
        "database_schema_invalid",
        `database "${dbName}": table "${config.name}" is exported more than once from ${schemaFile}`
      );
    }
    const table = extractTable(dbName, config.name, config);
    if (!table.ok) {
      return table;
    }
    tables[config.name] = table.value;
  }

  if (Object.keys(tables).length === 0) {
    return err(
      "database_schema_invalid",
      `database "${dbName}": schema file ${schemaFile} exports no tables`
    );
  }

  return { ok: true, value: { schemaFile, tables } };
}

type TableConfig = ReturnType<typeof getTableConfig>;

function extractTable(
  dbName: string,
  tableName: string,
  config: TableConfig
): ManifestResult<ManifestTable> {
  const where = `database "${dbName}", table "${tableName}"`;

  if (config.foreignKeys.length > 0) {
    return err(
      "database_schema_invalid",
      `${where}: foreign keys (.references() / foreignKey()) are not allowed in pod databases — enforce relational integrity in function code instead`
    );
  }
  if (config.checks.length > 0) {
    return err(
      "database_schema_invalid",
      `${where}: CHECK constraints are not allowed in pod databases — validate values in function code instead`
    );
  }
  // UNIQUE constraints live in the CREATE TABLE DDL: SQLite can only add or drop one through a
  // table rebuild, which reconcile refuses. uniqueIndex() (standalone CREATE/DROP INDEX
  // statements) is the one supported unique form.
  if (config.uniqueConstraints.length > 0) {
    return err(
      "database_schema_invalid",
      `${where}: UNIQUE constraints are not allowed in pod databases (they cannot be added or removed later without a table rebuild) — use uniqueIndex() instead`
    );
  }

  // Table-level primaryKey(): a single-column declaration folds into that column's primaryKey
  // flag; multiple columns are a composite primary key, which is rejected.
  const tableLevelPkColumns = new Set<string>();
  for (const pk of config.primaryKeys) {
    if (pk.columns.length > 1) {
      return err(
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

  for (const column of config.columns) {
    const nameError = safeNameError("column", column.name, where);
    if (nameError !== null) {
      return { ok: false, error: nameError };
    }
    if (boolProp(column, "isUnique")) {
      return err(
        "database_schema_invalid",
        `${where}: column "${column.name}" uses .unique() — UNIQUE constraints are not allowed in pod databases (they cannot be added or removed later without a table rebuild), use uniqueIndex() instead`
      );
    }
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
  }

  for (const index of config.indexes) {
    const indexConfig = index.config;
    const nameError = safeNameError("index", indexConfig.name, where);
    if (nameError !== null) {
      return { ok: false, error: nameError };
    }
    if (indexes[indexConfig.name] !== undefined) {
      return err(
        "database_schema_invalid",
        `${where}: duplicate index name "${indexConfig.name}"`
      );
    }
    const columnNames: string[] = [];
    for (const indexed of indexConfig.columns) {
      const columnName = stringProp(indexed, "name");
      if (columnName === undefined) {
        // Indexes are recorded as plain column lists; an expression index could be neither
        // diffed nor recreated from the manifest.
        return err(
          "database_schema_invalid",
          `${where}: index "${indexConfig.name}" uses an SQL expression — only plain column indexes are supported in pod databases`
        );
      }
      columnNames.push(columnName);
    }
    indexes[indexConfig.name] = {
      unique: indexConfig.unique,
      columns: columnNames,
    };
  }

  return { ok: true, value: { columns, indexes } };
}
