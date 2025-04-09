import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { MCPToolPermissionLevelType } from "@app/lib/actions/mcp_metadata";
import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServerToolMetadataModel extends WorkspaceAwareModel<RemoteMCPServerToolMetadataModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare remoteMCPServerId: ForeignKey<RemoteMCPServerModel["id"]>;
  declare toolName: string;
  declare permission: MCPToolPermissionLevelType;
}

RemoteMCPServerToolMetadataModel.init(
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
        model: RemoteMCPServerModel,
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
        name: "remote_mcp_server_tool_metadata_wid_serverid_tool_name"
      },
    ],
  }
);

RemoteMCPServerToolMetadataModel.belongsTo(RemoteMCPServerModel, {
  foreignKey: { allowNull: false, name: "remoteMCPServerId" },
  onDelete: "RESTRICT",
});

RemoteMCPServerModel.hasMany(RemoteMCPServerToolMetadataModel, {
  foreignKey: "remoteMCPServerId",
  onDelete: "RESTRICT",
});
