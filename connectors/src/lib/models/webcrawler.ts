import { ConnectorResourceType } from "@dust-tt/types";
import {
  type CreationOptional,
  DataTypes,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";

export class WebCrawlerConfiguration extends Model<
  InferAttributes<WebCrawlerConfiguration>,
  InferCreationAttributes<WebCrawlerConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare url: string;
  declare connectorId: ForeignKey<Connector["id"]>;
}

WebCrawlerConfiguration.init(
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
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [],
    modelName: "webcrawler_configurations",
  }
);
Connector.hasMany(WebCrawlerConfiguration);

export class WebCrawlerFolder extends Model<
  InferAttributes<WebCrawlerFolder>,
  InferCreationAttributes<WebCrawlerFolder>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare url: string;
  declare parentUrl: string | null;
  declare dustDocumentId: string | null;
  declare ressourceType: ConnectorResourceType;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare webcrawlerConfigurationId: ForeignKey<WebCrawlerConfiguration["id"]>;
}

WebCrawlerFolder.init(
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
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    parentUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ressourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustDocumentId: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        unique: true,
        fields: [
          "url",
          "connectorId",
          "webcrawlerConfigurationId",
          "ressourceType",
        ],
      },
    ],
    modelName: "webcrawler_folders",
  }
);
Connector.hasMany(WebCrawlerFolder);
WebCrawlerConfiguration.hasMany(WebCrawlerFolder);
