import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RunModel extends WorkspaceAwareModel<RunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustRunId: string;
  declare runType: string;

  declare appId: ForeignKey<AppModel["id"]>;

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
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
RunModel.belongsTo(AppModel, {
  as: "app",
  foreignKey: { name: "appId", allowNull: false },
});

export class RunUsageModel extends WorkspaceAwareModel<RunUsageModel> {
  declare runId: ForeignKey<RunModel["id"]>;

  declare providerId: string; //ModelProviderIdType;
  declare modelId: string; //ModelIdType;

  declare promptTokens: number;
  declare completionTokens: number;
  declare cachedTokens: number | null;
}

RunUsageModel.init(
  {
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
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
    cachedTokens: {
      type: DataTypes.INTEGER,
      defaultValue: null,
      allowNull: true,
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
