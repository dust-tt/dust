import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export const REMOTE_MCP_SERVER_STATUS = [
  "synchronized", // The server is synchronized with the local data
  "pending", // The server is waiting for the first synchronization
  "unreachable", // The server is unreachable
] as const;

export class RemoteMCPServer extends WorkspaceAwareModel<RemoteMCPServer> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare space: NonAttribute<SpaceModel>;

  declare name: string;
  declare url: string;

  declare description: string | null;
  declare cachedActions: string[];

  declare status: (typeof REMOTE_MCP_SERVER_STATUS)[number];
  declare lastSyncAt: Date | null;
  declare connectionToken: string;
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
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
      type: DataTypes.STRING,
      allowNull: true,
    },
    cachedActions: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [REMOTE_MCP_SERVER_STATUS],
      },
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    connectionToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "remote_mcp_server",
  }
);

SpaceModel.hasMany(RemoteMCPServer, {
  foreignKey: { allowNull: false, name: "vaultId" },
  onDelete: "RESTRICT",
});
RemoteMCPServer.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
});
