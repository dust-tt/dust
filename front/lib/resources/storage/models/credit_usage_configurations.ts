import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

/*
 * Workspace-level configuration for AWU credit purchases. Distinct from
 * `programmatic_usage_configurations`, whose microUSD-denominated fields
 * drive the programmatic (token-pricing) flow. Values here are in AWU
 * credits.
 *
 * Fields:
 * - defaultDiscountPercent: Discount applied to AWU credit purchases (0-100%)
 * - paygCapCredits: PAYG cap on AWU consumption, in AWU credits. Drives the
 *   Metronome `spend_threshold_reached` alert on the workspace's customer.
 */
export class CreditUsageConfigurationModel extends WorkspaceAwareModel<CreditUsageConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare defaultDiscountPercent: number;
  declare paygCapCredits: number | null;
}

CreditUsageConfigurationModel.init(
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
    defaultDiscountPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100,
      },
    },
    paygCapCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: {
        isPositive(value: number | null) {
          if (value !== null && value <= 0) {
            throw new Error(
              "paygCapCredits must be strictly positive when set"
            );
          }
        },
      },
    },
  },
  {
    modelName: "credit_usage_configuration",
    sequelize: frontSequelize,
    indexes: [
      // Enforce 1:1 relationship with workspace
      { unique: true, fields: ["workspaceId"] },
    ],
    relationship: "hasOne",
  }
);

CreditUsageConfigurationModel.belongsTo(WorkspaceModel, {
  foreignKey: { name: "workspaceId", allowNull: false },
});
