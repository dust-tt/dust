import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { DEFAULT_MCP_ACTION_VERSION } from "@app/lib/actions/constants";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPToolType } from "@app/lib/api/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServerModel extends WorkspaceAwareModel<RemoteMCPServerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare url: string;
  declare icon: CustomResourceIconType | InternalAllowedIconType;
  declare version: string;

  declare cachedName: string;
  declare cachedDescription: string | null;
  declare cachedTools: MCPToolType[];

  declare lastSyncAt: Date | null;
  declare lastError: string | null;

  declare sharedSecret: string | null;
  declare authorization: AuthorizationInfo | null;
  declare customHeaders: Record<string, string> | null;
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
    url: {
      type: DataTypes.STRING,
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
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    sharedSecret: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    authorization: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    customHeaders: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "remote_mcp_server",
    indexes: [{ fields: ["workspaceId"], concurrently: true }],
  }
);
