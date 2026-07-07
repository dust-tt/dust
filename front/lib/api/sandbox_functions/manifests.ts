import { z } from "zod";

// Zod mirrors of the manifest.v1 contract
// (design_docs/pod_state_progress/contracts/manifest.v1.md), produced by the dsbx build runner.
// Mirrors ManifestColumn / ManifestIndex / ManifestTable / DatabaseManifest / FunctionManifests
// in cli/dust-sandbox/functions-runner/manifest.ts.

// Mirrors DB_NAME_REGEX in cli/dust-sandbox/functions-runner/manifest.ts.
export const POD_DATABASE_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Mirrors RESERVED_OBJECT_KEYS in cli/dust-sandbox/functions-runner/manifest.ts: the build
// runner rejects these model-authored names; the mirror rejects them again so a hostile
// manifest cannot smuggle Object.prototype-colliding keys into front (prototype pollution).
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

export const functionManifestsSchema = z.object({
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
export type FunctionManifests = z.infer<typeof functionManifestsSchema>;
