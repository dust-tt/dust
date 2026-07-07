// manifest.v1 shape: the single authored definition of per-database manifests.
//
// This file must stay dependency-free (no imports): front type-imports it
// (front/lib/api/sandbox_functions/manifests.ts) and asserts its zod mirror infers exactly
// these shapes, so a shape change here fails front's typecheck instead of drifting
// silently. The runtime constants cannot cross that boundary (front never bundles cli
// code): front mirrors their values and equality-checks them in its tests.

export const DB_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Model-authored names become plain-object keys in manifests (runner + front + JSONB);
// these keys would collide with Object.prototype machinery.
export const RESERVED_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export type ManifestErrorKind =
  | "databases_declaration_invalid"
  | "database_schema_unresolvable"
  | "database_schema_invalid";

export interface ManifestError {
  kind: ManifestErrorKind;
  message: string;
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
