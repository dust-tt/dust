import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/*
 * Fields:
 * - freeCreditCents: Monthly amount awarded as free credits to the workspace (0-1,000,000 cents, nullable)
 * - defaultDiscountPercent: Discount applied when computing usage cost for this workspace (0-100%)
 * - paygCapCents: Pay-as-you-go cap in cents enterprise only feature - even in payg you want a ceiling
 */
export class ProgrammaticUsageConfigurationModel extends WorkspaceAwareModel<ProgrammaticUsageConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare freeCreditCents: number | null;
  declare defaultDiscountPercent: number;
  declare paygCapCents: number | null;
}

const MAX_FREE_AMOUNT_CENTS = 1_000_000;

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
      validate: {
        isValidFreeCreditAmount(value: number | null) {
          if (value !== null && (value < 0 || value > MAX_FREE_AMOUNT_CENTS)) {
            throw new Error(
              `freeCreditCents must be between 0 and ${MAX_FREE_AMOUNT_CENTS}`
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
    paygCapCents: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: {
        isPositive(value: number | null) {
          if (value !== null && value <= 0) {
            throw new Error("paygCapCents must be strictly positive when set");
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
