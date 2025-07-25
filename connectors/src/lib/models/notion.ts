import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { NotionBlockType, PageObjectProperties } from "@connectors/types";

export class NotionConnectorState extends ConnectorBaseModel<NotionConnectorState> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fullResyncStartTime?: CreationOptional<Date>;

  declare lastGarbageCollectionFinishTime?: Date;
  declare parentsLastUpdatedAt?: Date | null;

  declare notionWorkspaceId: string;
  declare privateIntegrationCredentialId?: string | null;
}
NotionConnectorState.init(
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
    fullResyncStartTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastGarbageCollectionFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    parentsLastUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notionWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    privateIntegrationCredentialId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "notion_connector_states",
    indexes: [{ fields: ["connectorId"], unique: true }],
    relationship: "hasOne",
  }
);

export class NotionPage extends ConnectorBaseModel<NotionPage> {
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
}
NotionPage.init(
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
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["connectorId"], concurrently: true },
      { fields: ["notionPageId", "connectorId"], unique: true },
      { fields: ["connectorId", "lastSeenTs"], concurrently: true },
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

export class NotionDatabase extends ConnectorBaseModel<NotionDatabase> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionDatabaseId: string;
  declare lastSeenTs: Date;
  declare firstSeenTs?: Date;
  declare lastCreatedOrMovedRunTs: CreationOptional<Date | null>;

  // These fields are used for the notion databaseUpsertQueueWorkflow.
  // They allow:
  // - debouncing multiple requests to upsert the same database
  // - prioritizing databases to upsert based on lastUpsertRequestedTs
  declare lastUpsertedRunTs: CreationOptional<Date | null>;
  declare upsertRequestedRunTs: Date | null;

  declare skipReason?: string | null;

  declare parentType?: string | null;
  declare parentId?: string | null;
  declare title?: string | null;
  declare titleSearchVector: unknown;
  declare notionUrl?: string | null;

  declare structuredDataEnabled: CreationOptional<boolean>;
  declare structuredDataUpsertedTs: CreationOptional<Date | null>;
}

NotionDatabase.init(
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
    notionDatabaseId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    firstSeenTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastCreatedOrMovedRunTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastUpsertedRunTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    upsertRequestedRunTs: {
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
    structuredDataEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    structuredDataUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["connectorId"], concurrently: true },
      { fields: ["notionDatabaseId", "connectorId"], unique: true },
      { fields: ["connectorId", "skipReason"] },
      { fields: ["lastSeenTs"] },
      { fields: ["lastCreatedOrMovedRunTs"] },
      { fields: ["parentId"] },
      { fields: ["connectorId", "lastSeenTs"], concurrently: true },
      {
        fields: ["titleSearchVector"],
        using: "gist",
        name: "notion_databases_title_search_vector_gist_idx",
      },
    ],
    modelName: "notion_databases",
  }
);

// This table is unlogged, meaning it doesn't generate WAL entries.
// This is because it's a cache table that generates a lot of writes and we don't want to fill up the WAL.
// It's also a cache table, so we don't care if we lose data.
// This table is not replicated to the read replica, and all data is lost on a failover.
export class NotionConnectorPageCacheEntry extends ConnectorBaseModel<NotionConnectorPageCacheEntry> {
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

  declare workflowId: string;
}
NotionConnectorPageCacheEntry.init(
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
    workflowId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "notion_connector_page_cache_entries",
    indexes: [
      {
        fields: ["notionPageId", "connectorId", "workflowId"],
        unique: true,
        name: "uq_notion_page_id_conn_id_wf_id",
      },
      { fields: ["connectorId"] },
      { fields: ["parentId"] },
      { fields: ["workflowId"] },
    ],
  }
);

// This table is unlogged, meaning it doesn't generate WAL entries.
// This is because it's a cache table that generates a lot of writes and we don't want to fill up the WAL.
// It's also a cache table, so we don't care if we lose data.
// This table is not replicated to the read replica, and all data is lost on a failover.
export class NotionConnectorBlockCacheEntry extends ConnectorBaseModel<NotionConnectorBlockCacheEntry> {
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

  declare workflowId: string;
}
NotionConnectorBlockCacheEntry.init(
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
      type: DataTypes.TEXT,
      allowNull: true,
    },
    workflowId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "notion_connector_block_cache_entries",
    indexes: [
      {
        fields: ["notionBlockId", "connectorId", "notionPageId", "workflowId"],
        unique: true,
        name: "uq_notion_block_id_conn_id_page_id_wf_id",
      },
      { fields: ["connectorId"] },
      { fields: ["parentBlockId"] },
      { fields: ["notionPageId"] },
      { fields: ["workflowId"] },
    ],
  }
);

// This table is unlogged, meaning it doesn't generate WAL entries.
// This is because it's a cache table that generates a lot of writes and we don't want to fill up the WAL.
// It's also a cache table, so we don't care if we lose data.
// This table is not replicated to the read replica, and all data is lost on a failover.
export class NotionConnectorResourcesToCheckCacheEntry extends ConnectorBaseModel<NotionConnectorResourcesToCheckCacheEntry> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionId: string;
  declare resourceType: "page" | "database";

  declare workflowId: string;
}
NotionConnectorResourcesToCheckCacheEntry.init(
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
    notionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workflowId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "notion_connector_resources_to_check_cache_entries",
    indexes: [
      {
        fields: ["notionId", "connectorId", "workflowId"],
        unique: true,
        name: "uq_notion_to_check_notion_id_conn_id_wf_id",
      },
      { fields: ["connectorId"] },
      { fields: ["workflowId"] },
    ],
  }
);
