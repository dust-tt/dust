import type { UsageType } from "@app/lib/metronome/types";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import type { Region } from "@app/lib/model_constructors/types/regions";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export type RunUsageState = "pending" | "reported" | "unavailable";

export class RunModel extends WorkspaceAwareModel<RunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustRunId: string;
  declare runType: string;
  declare useWorkspaceCredentials: boolean | null;
  // Identifies the agent-loop execution this run belongs to (sha256 of the
  // execution's sorted dustRunIds). Set at finalize so per-execution credit
  // costs can be ceiled per group, matching the Metronome billing partition.
  // Null for non-agent-loop runs and legacy rows.
  declare runKey: string | null;

  declare appId: ForeignKey<AppModel["id"]> | null;

  declare app: NonAttribute<AppModel>;
}

RunModel.init(
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
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useWorkspaceCredentials: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    runKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "run",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "appId", "runType", "createdAt"] },
      { fields: ["workspaceId", "createdAt"] },
      { unique: true, fields: ["dustRunId"] },
    ],
  }
);
AppModel.hasMany(RunModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
RunModel.belongsTo(AppModel, {
  as: "app",
  foreignKey: { name: "appId", allowNull: true },
});

export class RunUsageModel extends WorkspaceAwareModel<RunUsageModel> {
  declare runId: ForeignKey<RunModel["id"]>;

  // Historical identifiers: values remain valid after a provider or model is removed from the
  // active application unions.
  declare providerId: string;
  // Serving host used for the inference (for example "agent-platform"), as distinct from
  // providerId, which identifies the model/pricing provider.
  declare inferenceProvider: string | null;
  // Physical endpoint region used for the inference and provider billing.
  declare region: Region | null;
  declare modelId: string;

  declare promptTokens: number;
  declare completionTokens: number;
  // Subset of completionTokens when reported by the provider.
  declare reasoningTokens: number | null;
  declare cachedTokens: number | null;
  declare cacheCreationTokens: number | null;

  declare costMicroUsd: number;
  declare isBatch: boolean;
  declare serviceTier: ServiceTier;

  // Immutable billing usage type (free / user / programmatic), set when the
  // usage row is created. Nullable only for legacy rows written before every
  // creation path supplied the classification.
  declare usageType: UsageType | null;
  /**
   * @cc [owner:pmilliotte,label:product] run-usage-records-credential-owner
   * Records which credential source served the inference: `true` for credentials the workspace
   * provided -- a BYOK plan, or the legacy per-app provider keys selected by
   * `use_workspace_credentials` -- and `false` for Dust-managed ones. It must be set when the usage
   * row is created, from the plan in force then, and never recomputed on finalize, so the row keeps
   * pointing at the source that actually served it.
   *
   * Three limits on reading it. Rows created before 2026-09-16 read `false` whatever served them,
   * since the column shipped with that default and only the workspaces corrected by
   * `migrations/20260916_backfill_byok_run_usages.ts` read `true` before that date; and `runs`
   * carries an unrelated legacy column of the same name that predates this one. A legacy app run on
   * workspace provider keys records `true` from that selection alone: those credentials carry no
   * `DUST_BYOK` marker, so `core` can still fall back to its own environment key for a provider the
   * workspace never configured. And a batch row is only created when the results are retrieved, so it
   * carries the plan in force then rather than at submit: a workspace that flips BYOK while a batch
   * is pending records the source that did not serve it.
   */
  declare useWorkspaceCredentials: boolean;
  // Pending and unavailable rows represent provider attempts for which usage has not been
  // reported. Null is accepted during the rolling deployment.
  declare usageState: RunUsageState | null;
}

RunUsageModel.init(
  {
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inferenceProvider: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    region: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reasoningTokens: {
      type: DataTypes.INTEGER,
      defaultValue: null,
      allowNull: true,
    },
    cachedTokens: {
      type: DataTypes.INTEGER,
      defaultValue: null,
      allowNull: true,
    },
    cacheCreationTokens: {
      type: DataTypes.INTEGER,
      defaultValue: null,
      allowNull: true,
    },
    costMicroUsd: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
    },
    isBatch: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    serviceTier: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "default",
    },
    usageType: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    useWorkspaceCredentials: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    usageState: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "reported",
    },
  },
  {
    modelName: "run_usages",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["runId"] },
      { fields: ["providerId", "modelId"] },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

RunModel.hasMany(RunUsageModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
RunUsageModel.belongsTo(RunModel, {
  foreignKey: { allowNull: false },
});
