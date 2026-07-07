import { z } from "zod";

// Type-only import: erased at compile time, so front never bundles cli code and the
// runner's zod 4 never meets front's zod 3.
import type { FunctionStateManifest as RunnerFunctionStateManifest } from "../../../../cli/dust-sandbox/functions-runner/manifest_types";

// Zod parser for manifest.v1, produced by the dsbx build runner. The shape is authored
// once, in cli/dust-sandbox/functions-runner/manifest_types.ts; the assertions at the
// bottom of this file fail the typecheck if this mirror drifts from it. The schema file is
// read back from the sandbox, where model-authored code runs, so front revalidates it here
// instead of trusting the runner's build-time validation.

// Mirrors DB_NAME_REGEX in manifest_types.ts. Regex values cannot be type-checked and
// front cannot runtime-import cli code; equality is asserted in manifests.test.ts.
export const POD_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Mirrors RESERVED_OBJECT_KEYS in manifest_types.ts (rejection asserted in
// manifests.test.ts): the build runner rejects these model-authored names; the mirror
// rejects them again so a hostile manifest cannot smuggle Object.prototype-colliding keys
// into front (prototype pollution).
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const safeNameKey = z.string().refine((key) => !RESERVED_OBJECT_KEYS.has(key), {
  message: "reserved name",
});

const manifestColumnSchema = z.object({
  type: z.string(),
  mode: z.string().nullable(),
  notNull: z.boolean(),
  hasDefault: z.boolean(),
  primaryKey: z.boolean(),
  autoIncrement: z.boolean(),
});

const manifestIndexSchema = z.object({
  unique: z.boolean(),
  columns: z.array(z.string()),
});

const manifestTableSchema = z.object({
  columns: z.record(safeNameKey, manifestColumnSchema),
  indexes: z.record(safeNameKey, manifestIndexSchema),
});

const databaseManifestSchema = z.object({
  schemaFile: z.string(),
  tables: z.record(safeNameKey, manifestTableSchema),
});

export const functionStateManifestSchema = z.object({
  version: z.literal(1),
  databases: z.record(
    z.string().regex(POD_DATABASE_NAME_REGEX),
    databaseManifestSchema
  ),
});

export type ManifestColumn = z.infer<typeof manifestColumnSchema>;
export type ManifestIndex = z.infer<typeof manifestIndexSchema>;
export type ManifestTable = z.infer<typeof manifestTableSchema>;
export type DatabaseManifest = z.infer<typeof databaseManifestSchema>;
export type FunctionStateManifest = z.infer<typeof functionStateManifestSchema>;

// Compile-time drift tripwires: the zod mirror must infer exactly the runner's manifest
// shape, in both directions.
type Extends<A, B> = A extends B ? true : false;
const _mirrorCoversRunner: Extends<
  RunnerFunctionStateManifest,
  FunctionStateManifest
> = true;
const _runnerCoversMirror: Extends<
  FunctionStateManifest,
  RunnerFunctionStateManifest
> = true;
