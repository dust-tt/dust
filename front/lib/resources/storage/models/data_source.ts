import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Conversation } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ConnectorProvider } from "@app/types";

export class DataSourceModel extends SoftDeletableWorkspaceAwareModel<DataSourceModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to configure the connection.
  declare editedByUserId: ForeignKey<UserModel["id"]> | null;
  declare editedAt: Date;

  declare name: string;
  declare description: string | null;
  declare assistantDefaultSelected: boolean;
  declare dustAPIProjectId: string;
  declare dustAPIDataSourceId: string;
  declare connectorId: string | null;
  declare connectorProvider: ConnectorProvider | null;
  declare vaultId: ForeignKey<SpaceModel["id"]>;
  declare conversationId: ForeignKey<Conversation["id"]>;

  declare editedByUser: NonAttribute<UserModel>;
  declare conversation: NonAttribute<Conversation>;
  declare space: NonAttribute<SpaceModel>;
}

DataSourceModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deletedAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    assistantDefaultSelected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustAPIDataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    connectorId: {
      type: DataTypes.STRING,
    },
    connectorProvider: {
      type: DataTypes.STRING,
    },
  },
  {
    modelName: "data_source",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "name", "deletedAt"], unique: true },
      { fields: ["workspaceId", "connectorProvider"] },
      { fields: ["workspaceId", "vaultId"] },
      { fields: ["workspaceId", "conversationId"], unique: true },
      { fields: ["dustAPIProjectId"] },
    ],
  }
);
Conversation.hasMany(DataSourceModel, {
  as: "conversation",
  foreignKey: { name: "conversationId", allowNull: true },
  onDelete: "RESTRICT",
});

DataSourceModel.belongsTo(UserModel, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: true },
});

DataSourceModel.belongsTo(SpaceModel, {
  foreignKey: { name: "vaultId", allowNull: false },
  onDelete: "RESTRICT",
});
