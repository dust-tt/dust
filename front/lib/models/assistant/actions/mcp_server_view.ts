import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { assertNever } from "@app/types";

export class MCPServerViewModel extends SoftDeletableWorkspaceAwareModel<MCPServerViewModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to add the server to the space.
  declare editedByUserId: ForeignKey<UserModel["id"]> | null;
  declare editedAt: Date;

  declare serverType: "internal" | "remote";
  declare internalMCPServerId: string | null;
  declare remoteMCPServerId: ForeignKey<RemoteMCPServerModel["id"]> | null;

  declare vaultId: ForeignKey<SpaceModel["id"]>;

  declare editedByUser: NonAttribute<UserModel>;
  declare space: NonAttribute<SpaceModel>;
}
MCPServerViewModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deletedAt: {
      type: DataTypes.DATE,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    serverType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["internal", "remote"]],
      },
    },
    internalMCPServerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    remoteMCPServerId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: RemoteMCPServerModel,
        key: "id",
      },
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    modelName: "mcp_server_view",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "id"] },
      { fields: ["workspaceId", "vaultId"] },
      {
        fields: ["workspaceId", "remoteMCPServerId", "vaultId"],
        where: {
          deletedAt: null,
        },
        unique: true,
        name: "mcp_server_views_workspace_remote_mcp_server_vault_active",
      },
      {
        fields: ["workspaceId", "internalMCPServerId", "vaultId"],
        where: {
          deletedAt: null,
        },
        unique: true,
        name: "mcp_server_views_workspace_internal_mcp_server_vault_active",
      },
    ],
    hooks: {
      beforeValidate: (config: MCPServerViewModel) => {
        if (config.serverType) {
          switch (config.serverType) {
            case "internal":
              if (!config.internalMCPServerId) {
                throw new Error(
                  "internalMCPServerId is required for serverType internal"
                );
              }
              if (config.remoteMCPServerId) {
                throw new Error(
                  "remoteMCPServerId is not allowed for serverType internal"
                );
              }
              break;
            case "remote":
              if (!config.remoteMCPServerId) {
                throw new Error(
                  "remoteMCPServerId is required for serverType remote"
                );
              }
              if (config.internalMCPServerId) {
                throw new Error(
                  "internalMCPServerId is not allowed for serverType remote"
                );
              }
              break;
            default:
              assertNever(config.serverType);
          }
        }
      },
    },
  }
);

SpaceModel.hasMany(MCPServerViewModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
  onDelete: "RESTRICT",
});
MCPServerViewModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
});

RemoteMCPServerModel.hasMany(MCPServerViewModel, {
  as: "remoteMCPServerForView",
  foreignKey: { name: "remoteMCPServerId", allowNull: false },
  onDelete: "RESTRICT",
});
MCPServerViewModel.belongsTo(RemoteMCPServerModel, {
  as: "remoteMCPServerForView",
  foreignKey: { name: "remoteMCPServerId", allowNull: false },
});

MCPServerViewModel.belongsTo(UserModel, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: true },
});
