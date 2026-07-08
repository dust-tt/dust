import { z } from "zod";

// Type-only import: erased at compile time, so front never bundles cli code and the
// runner's zod 4 never meets front's zod 3.
import type { FunctionState as RunnerFunctionState } from "../../../../cli/dust-sandbox/functions-runner/types/db";

// Zod parser for the pod database shape (wire version 1) produced by the dsbx build runner.
// The shape is authored once, in cli/dust-sandbox/functions-runner/types/db.ts; the
// assertions at the bottom of this file fail the typecheck if this mirror drifts from it.
// The schema file is read back from the sandbox, where model-authored code runs, so front
// revalidates it here instead of trusting the runner's build-time validation.

// Mirrors DB_NAME_REGEX in types/db.ts. Regex values cannot be type-checked and front
// cannot runtime-import cli code; equality is asserted in manifests.test.ts.
export const POD_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Mirrors RESERVED_OBJECT_KEYS in types/db.ts (rejection asserted in manifests.test.ts):
// the build runner rejects these model-authored names; the mirror rejects them again so a
// hostile schema file cannot smuggle Object.prototype-colliding keys into front
// (prototype pollution).
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const safeNameKey = z.string().refine((key) => !RESERVED_OBJECT_KEYS.has(key), {
  message: "reserved name",
});

const databaseColumnSchema = z.object({
  type: z.string(),
  mode: z.string().nullable(),
  notNull: z.boolean(),
  hasDefault: z.boolean(),
  primaryKey: z.boolean(),
  autoIncrement: z.boolean(),
});

const databaseIndexSchema = z.object({
  unique: z.boolean(),
  columns: z.array(z.string()),
});

const databaseTableSchema = z.object({
  columns: z.record(safeNameKey, databaseColumnSchema),
  indexes: z.record(safeNameKey, databaseIndexSchema),
});

const databaseSchemaSchema = z.object({
  schemaFile: z.string(),
  tables: z.record(safeNameKey, databaseTableSchema),
});

export const functionStateSchema = z.object({
  version: z.literal(1),
  databases: z.record(
    z.string().regex(POD_DATABASE_NAME_REGEX),
    databaseSchemaSchema
  ),
});

export type DatabaseColumn = z.infer<typeof databaseColumnSchema>;
export type DatabaseIndex = z.infer<typeof databaseIndexSchema>;
export type DatabaseTable = z.infer<typeof databaseTableSchema>;
export type DatabaseSchema = z.infer<typeof databaseSchemaSchema>;
export type FunctionState = z.infer<typeof functionStateSchema>;

// Compile-time drift tripwires: the zod mirror must infer exactly the runner's shape, in
// both directions.
type Extends<A, B> = A extends B ? true : false;
const _mirrorCoversRunner: Extends<RunnerFunctionState, FunctionState> = true;
const _runnerCoversMirror: Extends<FunctionState, RunnerFunctionState> = true;
