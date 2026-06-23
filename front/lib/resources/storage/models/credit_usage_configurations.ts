export const DEFAULT_ALLOW_MEMBER_UPGRADE_REQUESTS = true;
export const DEFAULT_UPGRADE_REQUEST_EMAIL_ENABLED = true;
export const DEFAULT_AUTO_SEAT_UPGRADE_ENABLED = false;
export const DEFAULT_TOP_UP_ENABLED = false;
export const DEFAULT_AUTO_INVOICE_FINALIZATION_ENABLED = true;

import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

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
 * - allowMemberUpgradeRequests: Whether non-admin members who reach their
 *   per-user spend limit can request a spend-limit upgrade from the product.
 *   Defaults to true.
 * - upgradeRequestEmailEnabled: Whether workspace admins are emailed when a
 *   member requests an upgrade. Defaults to true.
 * - defaultPoolCapAwuCredits: Workspace-wide default per-user cap on
 *   workspace-pool AWU consumption, in AWU credits, excluding the seat
 *   allowance. NULL means no default is configured (the plan-tier default
 *   applies).
 * - programmaticMonthlyCapAwuCredits: Workspace monthly cap on programmatic
 *   (API) AWU consumption, in AWU credits. Source of truth for the cap; the
 *   four Metronome programmatic alerts (cap/warning/low/critical) are derived
 *   from it. NULL means no cap is configured; 0 is a meaningful hard cap.
 * - autoSeatUpgradeEnabled: Whether members who hit their per-user credit limit
 *   are automatically bumped to the next entitled seat tier (free→pro, pro→max,
 *   none→workspace) instead of being blocked. May increase the bill. Defaults to
 *   false.
 * - balanceThresholdAwuCredits: Credit balance (in AWU credits) below which
 *   workspace admins are emailed. Source of truth for the threshold value; the
 *   Metronome balance-threshold alert (see
 *   `lib/metronome/alerts/balance_threshold.ts`) is derived from it. NULL means
 *   no threshold is configured (the warning is off); 0 is normalized to NULL.
 * - topUpEnabled: When true, enterprise-plan workspaces show the "Top up"
 *   button on the Usage page. Defaults to false (enterprise workspaces are
 *   directed to sales by default).
 * - autoInvoiceFinalizationEnabled: When false, `cleanAndFinalizeMetronomeDraftInvoice`
 *   skips the Stripe finalization step and leaves the invoice as a cleaned draft
 *   for manual review. Defaults to true (finalization is automatic).
 *
 * The Metronome balance-threshold alert id (used by the webhook to match the
 * firing alert) is NOT stored here: it is a Metronome-generated value resolved
 * from the alert, with reads cached in Redis.
 */
export class CreditUsageConfigurationModel extends WorkspaceAwareModel<CreditUsageConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare defaultDiscountPercent: number;
  declare paygEnabled: CreationOptional<boolean>;
  declare usageCapCredits: number | null;
  declare allowMemberUpgradeRequests: CreationOptional<boolean>;
  declare upgradeRequestEmailEnabled: CreationOptional<boolean>;
  declare defaultPoolCapAwuCredits: number | null;
  declare programmaticMonthlyCapAwuCredits: number | null;
  declare autoSeatUpgradeEnabled: CreationOptional<boolean>;
  declare balanceThresholdAwuCredits: number | null;
  declare topUpEnabled: CreationOptional<boolean>;
  declare autoInvoiceFinalizationEnabled: CreationOptional<boolean>;
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
    allowMemberUpgradeRequests: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: DEFAULT_ALLOW_MEMBER_UPGRADE_REQUESTS,
    },
    upgradeRequestEmailEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: DEFAULT_UPGRADE_REQUEST_EMAIL_ENABLED,
    },
    defaultPoolCapAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    programmaticMonthlyCapAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    autoSeatUpgradeEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
    },
    balanceThresholdAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    topUpEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: DEFAULT_TOP_UP_ENABLED,
    },
    autoInvoiceFinalizationEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: DEFAULT_AUTO_INVOICE_FINALIZATION_ENABLED,
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
