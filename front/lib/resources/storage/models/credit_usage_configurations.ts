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
 * - paygEnabled: Whether PAYG mode is enabled for the workspace. Drives the
 *   AWU contract excess-credits recurring credit (zeroed when enabled, restored
 *   to the default amount when disabled).
 * - usageCapCredits: Workspace-level usage cap on AWU consumption, in AWU
 *   credits. NULL means no cap; any strictly-positive value drives the
 *   Metronome `spend_threshold_reached` alert on the workspace's customer.
 *   Independent from `paygEnabled` — the cap can be set even when PAYG is
 *   disabled, and PAYG can be enabled without a cap.
 * - disableCreditCapWarning: When true, the credit cap warning email to
 *   workspace admins is suppressed. Default false (warning is sent).
 */
export class CreditUsageConfigurationModel extends WorkspaceAwareModel<CreditUsageConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare defaultDiscountPercent: number;
  declare paygEnabled: CreationOptional<boolean>;
  declare usageCapCredits: number | null;
  declare disableCreditCapWarning: boolean;
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
    paygEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    usageCapCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: {
        isPositive(value: number | null) {
          if (value !== null && value <= 0) {
            throw new Error(
              "usageCapCredits must be strictly positive when set"
            );
          }
        },
      },
    },
    disableCreditCapWarning: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
