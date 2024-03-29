import type { CrawlingFrequency, DepthOption } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export class WebCrawlerConfiguration extends Model<
  InferAttributes<WebCrawlerConfiguration>,
  InferCreationAttributes<WebCrawlerConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare url: string;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare maxPageToCrawl: number;
  declare crawlMode: "child" | "website";
  declare depth: DepthOption;
  declare crawlFrequency: CrawlingFrequency;
  declare lastCrawledAt: Date | null;
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
    maxPageToCrawl: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    crawlMode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: true,
    },
    depth: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    crawlFrequency: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "monthly" satisfies CrawlingFrequency,
    },
    lastCrawledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [],
    modelName: "webcrawler_configurations",
  }
);
ConnectorModel.hasMany(WebCrawlerConfiguration);

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
  declare lastSeenAt: Date;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        unique: true,
        fields: ["url", "connectorId", "webcrawlerConfigurationId"],
      },
    ],
    modelName: "webcrawler_folders",
  }
);
ConnectorModel.hasMany(WebCrawlerFolder);
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
  declare depth: number;
  declare lastSeenAt: Date;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
    depth: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      {
        unique: true,
        fields: ["url", "connectorId", "webcrawlerConfigurationId"],
      },
    ],
    modelName: "webcrawler_pages",
  }
);
ConnectorModel.hasMany(WebCrawlerPage);
WebCrawlerConfiguration.hasMany(WebCrawlerPage);
