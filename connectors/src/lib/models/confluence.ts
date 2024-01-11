import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";

export class ConfluenceConfiguration extends Model<
  InferAttributes<ConfluenceConfiguration>,
  InferCreationAttributes<ConfluenceConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare cloudId: string;
  declare url: string;

  declare connectorId: ForeignKey<Connector["id"]>;
}
ConfluenceConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    cloudId: {
      type: DataTypes.STRING,
      allowNull: false,
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
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "confluence_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
Connector.hasOne(ConfluenceConfiguration);

// ConfluenceSpace stores the global spaces selected by the user to sync.
export class ConfluenceSpace extends Model<
  InferAttributes<ConfluenceSpace>,
  InferCreationAttributes<ConfluenceSpace>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare name: string;
  declare spaceId: string;
  declare urlSuffix?: string;
}
ConfluenceSpace.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    spaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    urlSuffix: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "confluence_spaces",
    indexes: [{ fields: ["connectorId", "spaceId"], unique: true }],
  }
);
Connector.hasOne(ConfluenceSpace);
