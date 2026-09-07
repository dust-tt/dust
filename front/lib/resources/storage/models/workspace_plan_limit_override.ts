import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional } from "sequelize";

/**
 * Per-workspace overrides of numeric plan limits.
 *
 * A `PlanModel` row is shared by every workspace subscribed to it, so raising a
 * limit for a single customer would otherwise mean creating a dedicated plan. A
 * row here overrides the matching `PlanModel` column for one workspace only. It
 * is applied when the plan is resolved for that workspace (see
 * `SubscriptionResource.determinePlanFromSubscription`), so every consumer of
 * `PlanType.limits` — enforcement and UI alike — sees the effective value.
 *
 * `null` means "not overridden, use the plan value". For numeric limits `-1`
 * keeps its plan meaning (unlimited), so raising a workspace to unlimited is
 * expressible. Boolean columns are tri-state for the same reason: `true` grants
 * a feature the plan does not include, `false` denies one it does.
 *
 * Columns are named exactly like their `PlanModel` counterparts so that the
 * merge in `applyPlanLimitOverrides` stays mechanical.
 */
export class WorkspacePlanLimitOverrideModel extends WorkspaceAwareModel<WorkspacePlanLimitOverrideModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare maxUsersInWorkspace: CreationOptional<number | null>;
  declare maxFreeUsersInWorkspace: CreationOptional<number | null>;
  declare maxLifetimeFreeUsersInWorkspace: CreationOptional<number | null>;
  declare maxVaultsInWorkspace: CreationOptional<number | null>;
  declare maxDataSourcesCount: CreationOptional<number | null>;
  declare maxConnectionsCount: CreationOptional<number | null>;

  declare isSSOAllowed: CreationOptional<boolean | null>;
  declare isSCIMAllowed: CreationOptional<boolean | null>;
}

WorkspacePlanLimitOverrideModel.init(
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
    // Range is enforced by `WorkspaceResource.upsertPlanLimitOverride`, the only
    // write path.
    maxUsersInWorkspace: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    maxFreeUsersInWorkspace: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    maxLifetimeFreeUsersInWorkspace: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    maxVaultsInWorkspace: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    maxDataSourcesCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    maxConnectionsCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    isSSOAllowed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    isSCIMAllowed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "workspace_plan_limit_override",
    sequelize: frontSequelize,
    indexes: [
      // Enforce 1:1 relationship with workspace.
      { unique: true, fields: ["workspaceId"] },
    ],
    relationship: "hasOne",
  }
);

WorkspacePlanLimitOverrideModel.belongsTo(WorkspaceModel, {
  foreignKey: { name: "workspaceId", allowNull: false },
});
