import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class RunModel extends BaseModel<RunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustRunId: string;
  declare runType: string;

  declare appId: ForeignKey<AppModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

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
Workspace.hasMany(RunModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class RunUsageModel extends BaseModel<RunUsageModel> {
  declare runId: ForeignKey<RunModel["id"]>;

  declare providerId: string; //ModelProviderIdType;
  declare modelId: string; //ModelIdType;

  declare promptTokens: number;
  declare completionTokens: number;
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
  },
  {
    modelName: "run_usages",
    sequelize: frontSequelize,
    indexes: [{ fields: ["runId"] }, { fields: ["providerId", "modelId"] }],
  }
);

RunModel.hasMany(RunUsageModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
