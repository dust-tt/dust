import type { PlatformActionsProviderType } from "@dust-tt/types";
import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class PlatformActionsConfigurationModel extends WorkspaceAwareModel<PlatformActionsConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare provider: PlatformActionsProviderType;
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
