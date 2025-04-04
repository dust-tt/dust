import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { DEFAULT_MCP_ACTION_DESCRIPTION, DEFAULT_MCP_ACTION_NAME, DEFAULT_MCP_ACTION_VERSION } from "@app/lib/actions/constants";
import type { AllowedIconType } from "@app/lib/actions/mcp_icons";
import {
  DEFAULT_MCP_SERVER_ICON,
  isAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import type {
  AuthorizationInfo,
  MCPToolType,
} from "@app/lib/actions/mcp_metadata";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServer extends WorkspaceAwareModel<RemoteMCPServer> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare url: string;
  declare name: string;
  declare description: string;
  declare icon: AllowedIconType;
  declare version: string;

  declare cachedTools: MCPToolType[];

  declare lastSyncAt: Date | null;
  declare sharedSecret: string;
  declare authorization: AuthorizationInfo | null;
}

RemoteMCPServer.init(
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
      defaultValue: DEFAULT_MCP_ACTION_NAME,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: DEFAULT_MCP_ACTION_DESCRIPTION,
    },
    icon: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_MCP_SERVER_ICON,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_MCP_ACTION_VERSION,
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
      beforeValidate: (server: RemoteMCPServer) => {
        if (server.icon && !isAllowedIconType(server.icon)) {
          throw new Error(`Invalid icon type: ${server.icon}`);
        }
      },
    },
  }
);
