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
  declare parentUrl: string | null;
  declare url: string;
  // Folders are not upserted to the data source but their ids are
  // used as parent to WebCrawlerPage.
  declare internalId: string;
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
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        unique: true,
        fields: ["url", "connectorId", "webcrawlerConfigurationId"],
      },
    ],
    modelName: "webcrawler_folders",
  }
);
Connector.hasMany(WebCrawlerFolder);
WebCrawlerConfiguration.hasMany(WebCrawlerFolder);

export class WebCrawlerPage extends Model<
  InferAttributes<WebCrawlerPage>,
  InferCreationAttributes<WebCrawlerPage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare title: string | null;
  declare parentUrl: string | null;
  declare url: string;
  declare documentId: string;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare webcrawlerConfigurationId: ForeignKey<WebCrawlerConfiguration["id"]>;
}

WebCrawlerPage.init(
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
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    parentUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        unique: true,
        fields: ["url", "connectorId", "webcrawlerConfigurationId"],
      },
    ],
    modelName: "webcrawler_pages",
  }
);
Connector.hasMany(WebCrawlerPage);
WebCrawlerConfiguration.hasMany(WebCrawlerPage);
