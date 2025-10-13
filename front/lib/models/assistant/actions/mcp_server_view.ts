import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { MCPOAuthUseCase } from "@app/types";
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

  // Can be null if the user did not set a custom name or description.
  declare name: string | null;
  declare description: string | null;

  declare vaultId: ForeignKey<SpaceModel["id"]>;

  declare editedByUser: NonAttribute<UserModel>;
  declare space: NonAttribute<SpaceModel>;
  declare remoteMCPServer: NonAttribute<RemoteMCPServerModel>;
  declare internalToolsMetadata: NonAttribute<
    RemoteMCPServerToolMetadataModel[]
  >;
  declare remoteToolsMetadata: NonAttribute<RemoteMCPServerToolMetadataModel[]>;

  declare oAuthUseCase: MCPOAuthUseCase | null;
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
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
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
    oAuthUseCase: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [["platform_actions", "personal_actions"]],
      },
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
        fields: ["workspaceId", "name", "vaultId"],
        where: {
          deletedAt: null,
        },
        unique: true,
        name: "mcp_server_views_workspace_name_vault_active",
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
  as: "remoteMCPServer",
  foreignKey: { name: "remoteMCPServerId", allowNull: false },
  onDelete: "RESTRICT",
});
MCPServerViewModel.belongsTo(RemoteMCPServerModel, {
  as: "remoteMCPServer",
  foreignKey: { name: "remoteMCPServerId", allowNull: false },
});

MCPServerViewModel.belongsTo(UserModel, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: true },
});

MCPServerViewModel.hasMany(RemoteMCPServerToolMetadataModel, {
  as: "internalToolsMetadata",
  foreignKey: { name: "internalMCPServerId", allowNull: true },
  sourceKey: "internalMCPServerId",
  constraints: false,
});

MCPServerViewModel.hasMany(RemoteMCPServerToolMetadataModel, {
  as: "remoteToolsMetadata",
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
  sourceKey: "remoteMCPServerId",
  constraints: false,
});

RemoteMCPServerToolMetadataModel.belongsTo(MCPServerViewModel, {
  as: "internalToolsMetadata",
  foreignKey: { name: "internalMCPServerId", allowNull: true },
  targetKey: "internalMCPServerId",
  constraints: false,
});

RemoteMCPServerToolMetadataModel.belongsTo(MCPServerViewModel, {
  as: "remoteToolsMetadata",
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
  targetKey: "remoteMCPServerId",
  constraints: false,
});
