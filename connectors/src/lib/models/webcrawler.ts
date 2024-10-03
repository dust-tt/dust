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

export class WebCrawlerConfigurationModel extends Model<
  InferAttributes<WebCrawlerConfigurationModel>,
  InferCreationAttributes<WebCrawlerConfigurationModel>
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

WebCrawlerConfigurationModel.init(
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
      type: DataTypes.STRING(512),
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
ConnectorModel.hasMany(WebCrawlerConfigurationModel);

export class WebCrawlerConfigurationHeader extends Model<
  InferAttributes<WebCrawlerConfigurationHeader>,
  InferCreationAttributes<WebCrawlerConfigurationHeader>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare key: string;
  declare value: string;
  declare webcrawlerConfigurationId: ForeignKey<
    WebCrawlerConfigurationModel["id"]
  >;
}

WebCrawlerConfigurationHeader.init(
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
    key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "webcrawler_configuration_headers",
    indexes: [
      {
        unique: true,
        fields: ["webcrawlerConfigurationId", "key"],
        name: "wch_webcrawlerConfigurationId_key",
      },
    ],
  }
);

WebCrawlerConfigurationModel.hasMany(WebCrawlerConfigurationHeader);

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
  declare webcrawlerConfigurationId: ForeignKey<
    WebCrawlerConfigurationModel["id"]
  >;
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
WebCrawlerConfigurationModel.hasMany(WebCrawlerFolder);

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
  declare webcrawlerConfigurationId: ForeignKey<
    WebCrawlerConfigurationModel["id"]
  >;
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
WebCrawlerConfigurationModel.hasMany(WebCrawlerPage);
