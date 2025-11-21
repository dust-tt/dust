import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * ProgrammaticUsageConfigurationModel
 *
 * Manages workspace-specific configuration for programmatic API usage.
 * This maintains a 1:1 relationship with workspaces (enforced by unique index on workspaceId).
 *
 * Fields:
 * - freeCreditCents: Monthly amount awarded as free credits to the workspace (0-1,000,000 cents, nullable)
 * - defaultDiscountPercent: Discount applied when computing usage cost for this workspace (0-100%)
 * - paygCapCents: Pay-as-you-go cap in cents (nullable, strictly positive when set)
 */
export class ProgrammaticUsageConfigurationModel extends WorkspaceAwareModel<ProgrammaticUsageConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare freeCreditCents: number | null;
  declare defaultDiscountPercent: number;
  declare paygCapCents: number | null;
}

ProgrammaticUsageConfigurationModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    freeCreditCents: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    defaultDiscountPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    paygCapCents: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "programmatic_usage_configuration",
    sequelize: frontSequelize,
    indexes: [
      // Enforce 1:1 relationship with workspace
      { unique: true, fields: ["workspaceId"] },
    ],
  }
);
