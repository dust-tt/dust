// This module re-exports everything from sequelize with one override: DataTypes.TEXT is removed.
// Import from this module instead of from "sequelize" directly.
//
// Use DataTypes.STRING(n) for bounded columns (preferred).
// Use DANGEROUSLY_UNBOUNDED_TEXT when an unbounded column is intentional.
//
// A grit rule enforces that DataTypes is never imported from "sequelize" directly.
// See .grit/patterns/noSequelizeDataTypesImport.grit.

import { DataTypes as SequelizeDataTypes } from "sequelize";

const { TEXT, ...rest } = SequelizeDataTypes;

export const DANGEROUSLY_UNBOUNDED_TEXT = TEXT;

export * from "sequelize";
export const DataTypes = rest as Omit<typeof SequelizeDataTypes, "TEXT">;
