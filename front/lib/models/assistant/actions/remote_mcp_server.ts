import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { MCPToolMetadata } from "@app/lib/actions/mcp_actions";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServer extends SoftDeletableWorkspaceAwareModel<RemoteMCPServer> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare space: NonAttribute<SpaceModel>;

  declare url: string;
  declare name: string;
  declare description: string | null;
  declare cachedTools: MCPToolMetadata[];

  declare lastSyncAt: Date | null;
  declare sharedSecret: string;
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
    deletedAt: {
      type: DataTypes.DATE,
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
