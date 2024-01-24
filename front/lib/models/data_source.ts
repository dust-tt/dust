import type { ConnectorProvider } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

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
  declare assistantDefaultSelected: boolean;
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
    assistantDefaultSelected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
      { fields: ["workspaceId", "name"] },
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
