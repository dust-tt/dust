import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServerToolMetadataModel extends WorkspaceAwareModel<RemoteMCPServerToolMetadataModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare remoteMCPServerId?: ForeignKey<RemoteMCPServerModel["id"]>;
  declare internalMCPServerId?: string;
  declare toolName: string;
  declare permission: MCPToolStakeLevelType;
  declare enabled: boolean;
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
      allowNull: true,
      references: {
        model: RemoteMCPServerModel,
        key: "id",
      },
    },
    internalMCPServerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    toolName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize: frontSequelize,
    tableName: "remote_mcp_server_tool_metadata",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "remoteMCPServerId", "toolName"],
        name: "remote_mcp_server_tool_metadata_wid_serverid_tool_name",
      },
      {
        unique: true,
        fields: ["workspaceId", "internalMCPServerId", "toolName"],
        name: "remote_mcp_server_tool_metadata_wid_internalserversid_tool_name",
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
