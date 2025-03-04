import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export const POKE_PLUGIN_RUN_MAX_RESULT_AND_ERROR_LENGTH = 4096;

export class PluginRunModel extends WorkspaceAwareModel<PluginRunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare args: string | null;
  declare author: string;
  declare error: string | null;
  declare pluginId: string;
  declare result: string | null;
  declare status: "pending" | "success" | "error";

  declare workspaceId: ForeignKey<Workspace["id"]>;
}

PluginRunModel.init(
  {
    args: {
      type: DataTypes.STRING,
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
  },
  {
    modelName: "plugin_run",
    sequelize: frontSequelize,
  }
);

// Sole exception to the rule: plugin runs are not required
// to be associated with a workspace.
Workspace.hasMany(PluginRunModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
PluginRunModel.belongsTo(Workspace, {
  foreignKey: { allowNull: true },
});
