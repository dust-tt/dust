import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { AppModel } from "@app/lib/resources/storage/models/apps";

export class RunModel extends Model<
  InferAttributes<RunModel>,
  InferCreationAttributes<RunModel>
> {
  declare id: CreationOptional<number>;
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
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
  onDelete: "CASCADE",
});
RunModel.belongsTo(AppModel, {
  as: "app",
  foreignKey: { name: "appId", allowNull: false },
});
Workspace.hasMany(RunModel, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class RunUsageModel extends Model<
  InferAttributes<RunUsageModel>,
  InferCreationAttributes<RunUsageModel>
> {
  declare id: CreationOptional<number>;

  declare runId: ForeignKey<RunModel["id"]>;

  declare providerId: string; //ModelProviderIdType;
  declare modelId: string; //ModelIdType;

  declare promptTokens: number;
  declare completionTokens: number;
}

RunUsageModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
  onDelete: "CASCADE",
});
