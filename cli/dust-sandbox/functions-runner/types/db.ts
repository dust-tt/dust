// Pod database shape (wire `version: 1`): the single authored definition.
//
// This file must stay dependency-free (no imports): front type-imports it
// (front/lib/api/sandbox_functions/manifests.ts) and asserts its zod mirror infers exactly
// these shapes, so a shape change here fails front's typecheck instead of drifting
// silently. The runtime constants cannot cross that boundary (front never bundles cli
// code): front mirrors their values and equality-checks them in its tests.

export const DB_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// Model-authored names become plain-object keys everywhere the shape travels (runner +
// front + JSONB); these keys would collide with Object.prototype machinery.
export const RESERVED_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export type DatabaseSchemaErrorKind =
  | "databases_declaration_invalid"
  | "database_schema_unresolvable"
  | "database_schema_invalid";

export interface DatabaseColumn {
  type: string;
  mode: string | null;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
}

export interface DatabaseIndex {
  unique: boolean;
  columns: string[];
}

export interface DatabaseTable {
  columns: Record<string, DatabaseColumn>;
  indexes: Record<string, DatabaseIndex>;
}

export interface DatabaseSchema {
  schemaFile: string;
  tables: Record<string, DatabaseTable>;
}

export interface FunctionState {
  version: 1;
  databases: Record<string, DatabaseSchema>;
}
