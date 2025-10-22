import type { Action } from "@mendable/firecrawl-js";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CrawlingFrequency, DepthOption } from "@connectors/types";

export class WebCrawlerConfigurationModel extends ConnectorBaseModel<WebCrawlerConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare url: string;
  declare maxPageToCrawl: number;
  declare crawlMode: "child" | "website";
  declare depth: DepthOption;
  declare crawlFrequency: CrawlingFrequency;
  declare lastCrawledAt: Date | null;
  declare crawlId: string | null;
  declare actions: Action[] | null;
  declare sitemapOnly: boolean;
}

WebCrawlerConfigurationModel.init(
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
    crawlId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    sitemapOnly: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [],
    modelName: "webcrawler_configurations",
  }
);

export class WebCrawlerConfigurationHeader extends ConnectorBaseModel<WebCrawlerConfigurationHeader> {
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
    sequelize: connectorsSequelize,
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

export class WebCrawlerFolder extends ConnectorBaseModel<WebCrawlerFolder> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare parentUrl: string | null;
  declare url: string;
  // Folders are not upserted to the data source but their ids are
  // used as parent to WebCrawlerPage.
  declare internalId: string;
  declare lastSeenAt: Date;
  declare webcrawlerConfigurationId: ForeignKey<
    WebCrawlerConfigurationModel["id"]
  >;
}

WebCrawlerFolder.init(
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
    sequelize: connectorsSequelize,
    indexes: [
      {
        unique: true,
        fields: ["url", "connectorId", "webcrawlerConfigurationId"],
      },
      {
        unique: true,
        fields: ["connectorId", "internalId"],
      },
    ],
    modelName: "webcrawler_folders",
  }
);
WebCrawlerConfigurationModel.hasMany(WebCrawlerFolder);

export class WebCrawlerPage extends ConnectorBaseModel<WebCrawlerPage> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare title: string | null;
  declare parentUrl: string | null;
  declare url: string;
  declare documentId: string;
  declare depth: number;
  declare lastSeenAt: Date;
  declare webcrawlerConfigurationId: ForeignKey<
    WebCrawlerConfigurationModel["id"]
  >;
}

WebCrawlerPage.init(
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
    sequelize: connectorsSequelize,
    indexes: [
      {
        unique: true,
        fields: ["url", "connectorId", "webcrawlerConfigurationId"],
      },
      {
        unique: true,
        fields: ["connectorId", "documentId"],
      },
    ],
    modelName: "webcrawler_pages",
  }
);
WebCrawlerConfigurationModel.hasMany(WebCrawlerPage);
