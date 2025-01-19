import type { PlatformActionsProviderType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class PlatformActionsConfigurationModel extends BaseModel<PlatformActionsConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare provider: PlatformActionsProviderType;

  declare workspaceId: ForeignKey<Workspace["id"]>;
}

PlatformActionsConfigurationModel.init(
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
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "platform_actions_configuration",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "provider"], unique: true }],
  }
);

Workspace.hasMany(PlatformActionsConfigurationModel, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "RESTRICT",
});
PlatformActionsConfigurationModel.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});
