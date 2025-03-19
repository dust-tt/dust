import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class RemoteMCPServer extends WorkspaceAwareModel<RemoteMCPServer> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare space: NonAttribute<SpaceModel>;

  declare name: string;
  declare url: string;

  declare description: string | null;
  declare cachedTools: string[];

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
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cachedTools: {
      type: DataTypes.ARRAY(DataTypes.STRING),
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
  foreignKey: { allowNull: false, name: "spaceId" },
  onDelete: "RESTRICT",
});
RemoteMCPServer.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "spaceId" },
});
