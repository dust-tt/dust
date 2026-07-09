// Pod database schema extraction for `dsbx function build`.
//
// A function declares the pod databases it opens in `schema.databases: string[]`. Each declared
// database must have a drizzle schema file at `databases/{db}.db.ts` relative to the function
// source file's directory. This module imports those schema files, collects their exported
// tables, validates the pod database rules (one named check per rule), and maps the tables to
// DatabaseSchemas via drizzle's `getTableConfig`. Failures come back as Err, never thrown.
//
// Cross-module-instance note: the schema file resolves its own `drizzle-orm` copy (NODE_PATH
// global in the sandbox), while this runner ships an inlined copy. Table detection therefore
// uses drizzle's `is()` (Symbol.for-keyed entityKind), never `instanceof`, and property reads
// on foreign column instances go through loose zod schemas.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { Err, Ok, type Result } from "./result.ts";
import {
  type DatabaseColumn,
  type DatabaseIndex,
  type DatabaseSchema,
  type DatabaseSchemaErrorKind,
  type DatabaseTable,
  DB_NAME_REGEX,
  RESERVED_OBJECT_KEYS,
  RESERVED_TABLE_PREFIXES,
} from "./types/db.ts";

export class DatabaseSchemaError extends Error {
  readonly kind: DatabaseSchemaErrorKind;

  constructor(kind: DatabaseSchemaErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

function err(
  kind: DatabaseSchemaErrorKind,
  message: string
): Err<DatabaseSchemaError> {
  return new Err(new DatabaseSchemaError(kind, message));
}

// `schema.databases`: unique names matching the database name contract. The regex rejects
// `__proto__` (leading underscore) but matches `constructor`/`prototype`, and database names
// become plain-object keys in the runner and front — reject the reserved keys explicitly.
const declaredDatabasesSchema = z
  .array(
    z
      .string()
      .regex(DB_NAME_REGEX, `must match ${DB_NAME_REGEX}`)
      .refine((name) => !RESERVED_OBJECT_KEYS.has(name), {
        message: "is a reserved name",
      })
  )
  .refine((names) => new Set(names).size === names.length, {
    message: "contains duplicate names",
  });

// Loose views over model-authored module exports and foreign drizzle instances: zod narrows
// the fields we read instead of casts (the instances come from the schema file's own
// drizzle-orm copy, so no class from ours matches them).
const schemaExportSchema = z.looseObject({ databases: z.unknown() });

const columnPropsSchema = z.looseObject({
  mode: z.string().optional(),
  columnType: z.string().optional(),
  isUnique: z.boolean().optional(),
  autoIncrement: z.boolean().optional(),
  onUpdateFn: z.unknown().optional(),
});

const indexedColumnSchema = z.looseObject({ name: z.string().optional() });

// Reads and validates the `databases` declaration off an already-importable handler module.
// Returns [] when the function declares none.
export async function readDeclaredDatabases(
  handlerPath: string
): Promise<Result<string[], DatabaseSchemaError>> {
  // Unguarded on purpose: the caller must have imported handlerPath successfully already
  // (build.ts runs getFunctionSchema first), so this import hits the module cache.
  const mod = await import(handlerPath);
  const schemaExport: unknown = Reflect.get(mod, "schema");
  const parsedExport = schemaExportSchema.safeParse(schemaExport);
  const declared: unknown = parsedExport.success
    ? parsedExport.data.databases
    : undefined;
  if (declared === undefined) {
    return new Ok([]);
  }
  const parsed = declaredDatabasesSchema.safeParse(declared);
  if (!parsed.success) {
    return err(
      "databases_declaration_invalid",
      `\`schema.databases\`: ${z.prettifyError(parsed.error)}`
    );
  }
  return new Ok(parsed.data);
}

// Validates every declared database's schema file (the canonical `databases/{db}.db.ts`
// relative to the function source directory) with the full rule set, so a bad schema fails
// the build with a model-correctable error. The extracted shapes stay runner-internal:
// nothing stores them — reconcile re-extracts from the schema file it is given.
export async function validateDeclaredDatabases(
  srcDir: string,
  dbNames: string[]
): Promise<Result<undefined, DatabaseSchemaError>> {
  for (const name of dbNames) {
    const schemaFile = join("databases", `${name}.db.ts`);
    const database = await extractDatabaseSchema(
      name,
      schemaFile,
      resolve(srcDir, schemaFile)
    );
    if (database.isErr()) {
      return database;
    }
  }
  return new Ok(undefined);
}

// Extracts (and rule-checks) the DatabaseSchema of one drizzle schema file. Also used by
// `dsbx db reconcile` as its schema-file validation step.
export async function extractDatabaseSchema(
  dbName: string,
  schemaFile: string,
  schemaPath: string
): Promise<Result<DatabaseSchema, DatabaseSchemaError>> {
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
  // able to collide with Object.prototype (defense in depth on top of checkNoReservedNames).
  const tables: Record<string, DatabaseTable> = Object.create(null);
  for (const value of Object.values(mod)) {
    if (!is(value, SQLiteTable)) {
      continue;
    }
    const config = getTableConfig(value);
    if (tables[config.name] !== undefined) {
      return err(
        "database_schema_invalid",
        `database "${dbName}": table "${config.name}" is exported more than once from ${schemaFile}`
      );
    }
    const validated = validateTableConfig(dbName, config);
    if (validated.isErr()) {
      return validated;
    }
    tables[config.name] = toDatabaseTable(validated.value);
  }

  if (Object.keys(tables).length === 0) {
    return err(
      "database_schema_invalid",
      `database "${dbName}": schema file ${schemaFile} exports no tables`
    );
  }

  return new Ok({ schemaFile, tables });
}

type TableConfig = ReturnType<typeof getTableConfig>;

// One named check per pod database rule. Each returns the violation or null.
type TableRule = (
  where: string,
  config: TableConfig
) => DatabaseSchemaError | null;

// Only constructs that block ADDITIVE EVOLUTION are rejected here (they live in the CREATE
// TABLE DDL, which reconcile can never rebuild) plus names invisible to reconcile's
// introspection. Anything SQLite itself refuses (duplicate names, double primary keys) fails
// at `db reconcile` apply time instead — nothing records the shapes anymore, so there is no
// recorded contract to protect.
const TABLE_RULES: TableRule[] = [
  checkNoReservedNames,
  checkNoForeignKeys,
  checkNoCheckConstraints,
  checkNoUniqueConstraints,
];

// Runs every table rule; a valid config comes back unchanged, ready for toDatabaseTable.
function validateTableConfig(
  dbName: string,
  config: TableConfig
): Result<TableConfig, DatabaseSchemaError> {
  const where = `database "${dbName}", table "${config.name}"`;
  for (const rule of TABLE_RULES) {
    const violation = rule(where, config);
    if (violation !== null) {
      return new Err(violation);
    }
  }
  return new Ok(config);
}

function invalid(message: string): DatabaseSchemaError {
  return new DatabaseSchemaError("database_schema_invalid", message);
}

function checkNoReservedNames(
  where: string,
  config: TableConfig
): DatabaseSchemaError | null {
  if (
    RESERVED_TABLE_PREFIXES.some((prefix) => config.name.startsWith(prefix))
  ) {
    return invalid(
      `${where}: table name uses a reserved prefix (${RESERVED_TABLE_PREFIXES.join(", ")}) and is not allowed in pod databases`
    );
  }
  const names = [
    config.name,
    ...config.columns.map((column) => column.name),
    ...config.indexes.map((index) => index.config.name),
  ];
  for (const name of names) {
    if (RESERVED_OBJECT_KEYS.has(name)) {
      return invalid(
        `${where}: name "${name}" is reserved and not allowed in pod databases`
      );
    }
  }
  return null;
}

function checkNoForeignKeys(
  where: string,
  config: TableConfig
): DatabaseSchemaError | null {
  if (config.foreignKeys.length > 0) {
    return invalid(
      `${where}: foreign keys (.references() / foreignKey()) are not allowed in pod databases — enforce relational integrity in function code instead`
    );
  }
  return null;
}

function checkNoCheckConstraints(
  where: string,
  config: TableConfig
): DatabaseSchemaError | null {
  if (config.checks.length > 0) {
    return invalid(
      `${where}: CHECK constraints are not allowed in pod databases — validate values in function code instead`
    );
  }
  return null;
}

// UNIQUE constraints live in the CREATE TABLE DDL: SQLite can only add or drop one through a
// table rebuild, which reconcile refuses. uniqueIndex() (standalone CREATE/DROP INDEX
// statements) is the one supported unique form.
function checkNoUniqueConstraints(
  where: string,
  config: TableConfig
): DatabaseSchemaError | null {
  if (config.uniqueConstraints.length > 0) {
    return invalid(
      `${where}: UNIQUE constraints are not allowed in pod databases (they cannot be added or removed later without a table rebuild) — use uniqueIndex() instead`
    );
  }
  for (const column of config.columns) {
    if (columnProps(column).isUnique === true) {
      return invalid(
        `${where}: column "${column.name}" uses .unique() — UNIQUE constraints are not allowed in pod databases (they cannot be added or removed later without a table rebuild), use uniqueIndex() instead`
      );
    }
  }
  return null;
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

// Maps a rule-checked TableConfig to the wire shape. Pure: all rejections happened in
// validateTableConfig.
function toDatabaseTable(config: TableConfig): DatabaseTable {
  // Table-level primaryKey(): single-column declarations (composite ones were rejected) fold
  // into that column's primaryKey flag.
  const tableLevelPkColumns = new Set(
    config.primaryKeys.flatMap((pk) => pk.columns.map((column) => column.name))
  );

  // Null-prototype accumulators: column/index names are model-authored object keys.
  const columns: Record<string, DatabaseColumn> = Object.create(null);
  for (const column of config.columns) {
    const props = columnProps(column);
    columns[column.name] = {
      type: column.getSQLType().toLowerCase(),
      mode: props.mode ?? MODE_BY_COLUMN_TYPE[props.columnType ?? ""] ?? null,
      notNull: column.notNull,
      hasDefault: column.hasDefault || props.onUpdateFn != null,
      primaryKey: column.primary || tableLevelPkColumns.has(column.name),
      autoIncrement: props.autoIncrement === true,
    };
  }

  const indexes: Record<string, DatabaseIndex> = Object.create(null);
  for (const index of config.indexes) {
    // Expression members have no column name; record the named ones. The recording is
    // internal to validation/reconcile — nothing stores or diffs it.
    indexes[index.config.name] = {
      unique: index.config.unique,
      columns: indexColumnNames(index.config) ?? [],
    };
  }

  return { columns, indexes };
}

type ColumnProps = z.infer<typeof columnPropsSchema>;

function columnProps(column: object): Partial<ColumnProps> {
  const parsed = columnPropsSchema.safeParse(column);
  return parsed.success ? parsed.data : {};
}

// The plain column names of an index, or null if any entry is an SQL expression.
function indexColumnNames(
  indexConfig: TableConfig["indexes"][number]["config"]
): string[] | null {
  const names: string[] = [];
  for (const indexed of indexConfig.columns) {
    const parsed = indexedColumnSchema.safeParse(indexed);
    const name = parsed.success ? parsed.data.name : undefined;
    if (name === undefined) {
      return null;
    }
    names.push(name);
  }
  return names;
}
