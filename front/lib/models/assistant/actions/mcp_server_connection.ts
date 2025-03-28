import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class MCPServerConnection extends WorkspaceAwareModel<MCPServerConnection> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectionId: string;
  declare connectionType: "workspace" | "personal";

  declare userId: ForeignKey<UserModel["id"]>;

  declare serverType: "internal" | "remote";

  declare internalMCPServerId: string | null;

  declare remoteMCPServerId: ForeignKey<RemoteMCPServer["id"]> | null;

  declare user: NonAttribute<UserModel>;
}

MCPServerConnection.init(
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
        model: RemoteMCPServer,
        key: "id",
      },
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "mcp_server_connection",
    indexes: [
      {
        fields: ["workspaceId", "internalMCPServerId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "remoteMCPServerId"],
        concurrently: true,
      },
    ],
  }
);

RemoteMCPServer.hasMany(MCPServerConnection, {
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
  onDelete: "RESTRICT",
});
MCPServerConnection.belongsTo(RemoteMCPServer, {
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
});

UserModel.hasMany(MCPServerConnection, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
MCPServerConnection.belongsTo(UserModel, {
  as: "user",
  foreignKey: { name: "userId", allowNull: false },
});
