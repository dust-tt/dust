import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { assertNever } from "@app/types";

export class MCPServerConnectionModel extends WorkspaceAwareModel<MCPServerConnectionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare connectionType: "workspace" | "personal";

  declare userId: ForeignKey<UserModel["id"]>;

  declare serverType: "internal" | "remote";

  declare internalMCPServerId: string | null;

  declare remoteMCPServerId: ForeignKey<RemoteMCPServerModel["id"]> | null;

  declare user: NonAttribute<UserModel>;
}

MCPServerConnectionModel.init(
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
    connectionType: {
      type: DataTypes.STRING,
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
  },
  {
    sequelize: frontSequelize,
    modelName: "mcp_server_connection",
    indexes: [
      // TODO(2025-10-27 flav) Delete once new indexes have been created.
      {
        fields: ["workspaceId", "internalMCPServerId"],
        concurrently: true,
      },
      // TODO(2025-10-27 flav) Delete once new indexes have been created.
      {
        fields: ["workspaceId", "remoteMCPServerId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "connectionType", "userId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "serverType", "remoteMCPServerId"],
        concurrently: true,
        name: "idx_workspace_server_remote",
      },
      {
        fields: ["workspaceId", "serverType", "internalMCPServerId"],
        concurrently: true,
        name: "idx_workspace_server_internal",
      },
    ],
    hooks: {
      beforeValidate: (config: MCPServerConnectionModel) => {
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

RemoteMCPServerModel.hasMany(MCPServerConnectionModel, {
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
  onDelete: "RESTRICT",
});
MCPServerConnectionModel.belongsTo(RemoteMCPServerModel, {
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
});

UserModel.hasMany(MCPServerConnectionModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
MCPServerConnectionModel.belongsTo(UserModel, {
  as: "user",
  foreignKey: { name: "userId", allowNull: false },
});
