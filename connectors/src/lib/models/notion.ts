import {
  type CreationOptional,
  DataTypes,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from "sequelize";

import {
  NotionBlockType,
  PageObjectProperties,
} from "@connectors/connectors/notion/lib/types";
import { Connector, sequelize_conn } from "@connectors/lib/models";

export class NotionConnectorState extends Model<
  InferAttributes<NotionConnectorState>,
  InferCreationAttributes<NotionConnectorState>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare lastGarbageCollectionFinishTime?: Date;

  declare connectorId: ForeignKey<Connector["id"]>;
}
NotionConnectorState.init(
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
    lastGarbageCollectionFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "notion_connector_states",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
Connector.hasOne(NotionConnectorState);

export class NotionPage extends Model<
  InferAttributes<NotionPage>,
  InferCreationAttributes<NotionPage>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionPageId: string;
  declare lastSeenTs: Date;
  declare lastUpsertedTs?: Date;
  declare lastCreatedOrMovedRunTs: CreationOptional<Date | null>;

  declare skipReason?: string | null;

  declare parentType?: string | null;
  declare parentId?: string | null;
  declare title?: string | null;
  declare titleSearchVector: unknown;
  declare notionUrl?: string | null;

  declare connectorId: ForeignKey<Connector["id"]> | null;
}
NotionPage.init(
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
    notionPageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastCreatedOrMovedRunTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    titleSearchVector: {
      type: DataTypes.TSVECTOR,
      allowNull: true,
    },
    notionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["notionPageId", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["lastSeenTs"] },
      { fields: ["parentId"] },
      { fields: ["lastCreatedOrMovedRunTs"] },
      {
        fields: ["titleSearchVector"],
        using: "gist",
        name: "notion_pages_title_search_vector_gist_idx",
      },
    ],
    modelName: "notion_pages",
  }
);
Connector.hasMany(NotionPage);

export class NotionDatabase extends Model<
  InferAttributes<NotionDatabase>,
  InferCreationAttributes<NotionDatabase>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionDatabaseId: string;
  declare lastSeenTs: Date;
  declare lastCreatedOrMovedRunTs: CreationOptional<Date | null>;

  declare skipReason?: string | null;

  declare parentType?: string | null;
  declare parentId?: string | null;
  declare title?: string | null;
  declare titleSearchVector: unknown;
  declare notionUrl?: string | null;

  declare connectorId: ForeignKey<Connector["id"]> | null;
}
NotionDatabase.init(
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
    notionDatabaseId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastCreatedOrMovedRunTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    titleSearchVector: {
      type: DataTypes.TSVECTOR,
      allowNull: true,
    },
    notionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["notionDatabaseId", "connectorId"], unique: true },
      { fields: ["connectorId", "skipReason"] },
      { fields: ["lastSeenTs"] },
      { fields: ["lastCreatedOrMovedRunTs"] },
      { fields: ["parentId"] },
      {
        fields: ["titleSearchVector"],
        using: "gist",
        name: "notion_databases_title_search_vector_gist_idx",
      },
    ],
    modelName: "notion_databases",
  }
);
Connector.hasMany(NotionDatabase);

export class NotionConnectorPageCacheEntry extends Model<
  InferAttributes<NotionConnectorPageCacheEntry>,
  InferCreationAttributes<NotionConnectorPageCacheEntry>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionPageId: string;
  declare pageProperties: PageObjectProperties; // JSON -- typed but not guaranteed
  declare pagePropertiesText: string;
  declare parentId: string;
  declare parentType: "database" | "page" | "workspace" | "block" | "unknown";
  declare lastEditedById: string;
  declare createdById: string;
  declare createdTime: string;
  declare lastEditedTime: string;
  declare url: string;

  declare connectorId: ForeignKey<Connector["id"]>;
}
NotionConnectorPageCacheEntry.init(
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
    notionPageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pageProperties: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    pagePropertiesText: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "{}",
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastEditedById: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    createdById: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    createdTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastEditedTime: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "notion_connector_page_cache_entries",
    indexes: [
      { fields: ["notionPageId", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["parentId"] },
    ],
  }
);
Connector.hasMany(NotionConnectorPageCacheEntry);

export class NotionConnectorBlockCacheEntry extends Model<
  InferAttributes<NotionConnectorBlockCacheEntry>,
  InferCreationAttributes<NotionConnectorBlockCacheEntry>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionPageId: string;
  declare notionBlockId: string;
  declare blockText: string | null;
  declare blockType: NotionBlockType;
  declare parentBlockId: string | null;
  declare indexInParent: number;

  // special case for child DBs
  declare childDatabaseTitle?: string | null;

  declare connectorId: ForeignKey<Connector["id"]>;
}
NotionConnectorBlockCacheEntry.init(
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
    notionPageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    notionBlockId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    blockText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    blockType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentBlockId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    indexInParent: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    childDatabaseTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "notion_connector_block_cache_entries",
    indexes: [
      {
        fields: ["notionBlockId", "connectorId", "notionPageId"],
        unique: true,
        name: "uq_notion_block_id_conn_id_page_id",
      },
      { fields: ["connectorId"] },
      { fields: ["parentBlockId"] },
      { fields: ["notionPageId"] },
    ],
  }
);
Connector.hasMany(NotionConnectorBlockCacheEntry);

export class NotionConnectorResourcesToCheckCacheEntry extends Model<
  InferAttributes<NotionConnectorResourcesToCheckCacheEntry>,
  InferCreationAttributes<NotionConnectorResourcesToCheckCacheEntry>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionId: string;
  declare resourceType: "page" | "database";
  declare connectorId: ForeignKey<Connector["id"]>;
}
NotionConnectorResourcesToCheckCacheEntry.init(
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
    notionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "notion_connector_resources_to_check_cache_entries",
    indexes: [
      {
        fields: ["notionId", "connectorId"],
        unique: true,
        name: "uq_notion_to_check_notion_id_conn_id",
      },
      { fields: ["connectorId"] },
    ],
  }
);
Connector.hasMany(NotionConnectorResourcesToCheckCacheEntry);
