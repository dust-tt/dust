import type { ConnectorProvider } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";

export class DataSource extends Model<
  InferAttributes<DataSource>,
  InferCreationAttributes<DataSource>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to configure the connection.
  declare editedByUserId: ForeignKey<User["id"]>;
  declare editedAt: CreationOptional<Date>;

  declare name: string;
  declare description: string | null;
  declare assistantDefaultSelected: boolean;
  declare dustAPIProjectId: string;
  declare dustAPIDataSourceId: string | null;
  declare connectorId: string | null;
  declare connectorProvider: ConnectorProvider | null;
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare vaultId: ForeignKey<VaultModel["id"]>;

  declare editedByUser: NonAttribute<User>;
  declare vault: NonAttribute<VaultModel>;
  declare workspace: NonAttribute<Workspace>;
}

DataSource.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    editedAt: {
      type: DataTypes.DATE,
      // TODO(2024-01-25 flav) Set `allowNull` to `false` once backfilled.
      allowNull: true,
      defaultValue: DataTypes.NOW,
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
      allowNull: true,
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
      { fields: ["workspaceId", "name"], unique: true },
      { fields: ["workspaceId", "connectorProvider"] },
      { fields: ["workspaceId", "vaultId"] },
    ],
  }
);
Workspace.hasMany(DataSource, {
  as: "workspace",
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
DataSource.belongsTo(Workspace, {
  as: "workspace",
  foreignKey: { name: "workspaceId", allowNull: false },
});

DataSource.belongsTo(User, {
  as: "editedByUser",
  // TODO(2024-01-25 flav) Set `allowNull` to `false` once backfilled.
  foreignKey: { name: "editedByUserId", allowNull: true },
});

DataSource.belongsTo(VaultModel, {
  foreignKey: { name: "vaultId", allowNull: false },
  onDelete: "RESTRICT",
});
