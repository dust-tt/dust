import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { MCPToolPermissionType } from "@app/lib/actions/mcp_metadata";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServerToolMetadata extends WorkspaceAwareModel<RemoteMCPServerToolMetadata> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare remoteMCPServerId: ForeignKey<RemoteMCPServer["id"]>;
  declare toolName: string;
  declare permission: MCPToolPermissionType;
}

RemoteMCPServerToolMetadata.init(
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
    remoteMCPServerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: RemoteMCPServer,
        key: "id",
      },
    },
    toolName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    tableName: "remote_mcp_server_tool_metadata",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "remoteMCPServerId", "toolName"],
      },
    ],
  }
);

RemoteMCPServerToolMetadata.belongsTo(RemoteMCPServer, {
  foreignKey: { allowNull: false, name: "remoteMCPServerId" },
  onDelete: "RESTRICT",
});

RemoteMCPServer.hasMany(RemoteMCPServerToolMetadata, {
  foreignKey: "remoteMCPServerId",
  onDelete: "RESTRICT",
});
