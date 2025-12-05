import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/*
 * Fields:
 * - freeCreditMicroUsd: Monthly amount awarded as free credits to the workspace (0-10,000,000,000 microUSD, nullable)
 * - defaultDiscountPercent: Discount applied when computing usage cost for this workspace (0-100%)
 * - paygCapMicroUsd: Pay-as-you-go cap in microUSD enterprise only feature - even in payg you want a ceiling
 */
export class ProgrammaticUsageConfigurationModel extends WorkspaceAwareModel<ProgrammaticUsageConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare freeCreditMicroUsd: number | null;
  declare defaultDiscountPercent: number;
  declare paygCapMicroUsd: number | null;
}

const MAX_FREE_AMOUNT_MICRO_USD = 10_000_000_000;

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
    freeCreditMicroUsd: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: null,
      validate: {
        isValidFreeCreditAmount(value: number | null) {
          if (
            value !== null &&
            (value < 0 || value > MAX_FREE_AMOUNT_MICRO_USD)
          ) {
            throw new Error(
              `freeCreditMicroUsd must be between 0 and ${MAX_FREE_AMOUNT_MICRO_USD}`
            );
          }
        },
      },
    },
    defaultDiscountPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 100,
      },
    },
    paygCapMicroUsd: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: null,
      validate: {
        isPositive(value: number | null) {
          if (value !== null && value <= 0) {
            throw new Error(
              "paygCapMicroUsd must be strictly positive when set"
            );
          }
        },
      },
    },
  },
  {
    modelName: "programmatic_usage_configuration",
    sequelize: frontSequelize,
    indexes: [
      // Enforce 1:1 relationship with workspace
      { unique: true, fields: ["workspaceId"] },
    ],
    relationship: "hasOne",
  }
);

ProgrammaticUsageConfigurationModel.belongsTo(WorkspaceModel, {
  foreignKey: { name: "workspaceId", allowNull: false },
});
