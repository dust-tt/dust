import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { DEFAULT_MCP_ACTION_VERSION } from "@app/lib/actions/constants";
import type { AllowedIconType } from "@app/lib/actions/mcp_icons";
import { isAllowedIconType } from "@app/lib/actions/mcp_icons";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPToolType } from "@app/lib/api/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServerModel extends WorkspaceAwareModel<RemoteMCPServerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare url: string;
  declare name: string;
  declare description: string;
  declare icon: AllowedIconType;
  declare version: string;

  declare cachedName: string;
  declare cachedDescription: string | null;
  declare cachedTools: MCPToolType[];

  declare lastSyncAt: Date | null;
  declare sharedSecret: string;
  declare authorization: AuthorizationInfo | null;
}

RemoteMCPServerModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    icon: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_MCP_ACTION_VERSION,
    },
    cachedName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    cachedDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cachedTools: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sharedSecret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    authorization: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "remote_mcp_server",
    hooks: {
      beforeValidate: (server: RemoteMCPServerModel) => {
        if (server.icon && !isAllowedIconType(server.icon)) {
          throw new Error(`Invalid icon type: ${server.icon}`);
        }
      },
    },
  }
);
