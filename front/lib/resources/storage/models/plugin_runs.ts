import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { SupportedResourceType } from "@app/types";

export const POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH = 4096;
export const POKE_PLUGIN_RUN_MAX_ARGS_LENGTH = 1024;

export class PluginRunModel extends BaseModel<PluginRunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare args: string | null;
  declare author: string;
  declare error: string | null;
  declare pluginId: string;
  declare result: string | null;
  declare status: "pending" | "success" | "error";

  declare resourceType: SupportedResourceType;
  declare resourceId: string | null;

  declare workspaceId: ForeignKey<WorkspaceModel["id"]> | null;
}

PluginRunModel.init(
  {
    args: {
      type: DataTypes.STRING(POKE_PLUGIN_RUN_MAX_ARGS_LENGTH),
      allowNull: true,
    },
    author: {
      type: DataTypes.STRING,
      allowNull: false,
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
    pluginId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    result: {
      type: new DataTypes.STRING(POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    error: {
      type: new DataTypes.STRING(POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH),
      allowNull: true,
    },
    resourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "plugin_run",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["resourceType", "resourceId"] },
      { fields: ["workspaceId", "resourceType", "resourceId", "createdAt"] },
    ],
  }
);

// Sole exception to the rule: plugin runs are not required
// to be associated with a workspace.
WorkspaceModel.hasMany(PluginRunModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
PluginRunModel.belongsTo(WorkspaceModel, {
  foreignKey: { allowNull: true },
});
