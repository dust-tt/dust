import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";

import { ConnectorProvider } from "@app/lib/connectors_api";
import { front_sequelize } from "@app/lib/databases";
import { Workspace } from "@app/lib/models/workspace";

export class DataSource extends Model<
  InferAttributes<DataSource>,
  InferCreationAttributes<DataSource>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description: string | null;
  declare visibility: "public" | "private";
  declare assistantDefaultSelected: boolean;
  declare config: string | null;
  declare dustAPIProjectId: string;
  declare connectorId: string | null;
  declare connectorProvider: ConnectorProvider | null;
  declare workspaceId: ForeignKey<Workspace["id"]>;

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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    assistantDefaultSelected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    config: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
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
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId", "visibility"] },
      { fields: ["workspaceId", "name", "visibility"] },
      { fields: ["workspaceId", "name"], unique: true },
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
