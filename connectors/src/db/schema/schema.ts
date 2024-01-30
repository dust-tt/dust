import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const connectors = pgTable(
  "connectors",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    type: varchar("type", { length: 255 }).notNull(),
    connectionId: varchar("connectionId", { length: 255 }).notNull(),
    workspaceApiKey: varchar("workspaceAPIKey", { length: 255 }).notNull(),
    workspaceId: varchar("workspaceId", { length: 255 }).notNull(),
    dataSourceName: varchar("dataSourceName", { length: 255 }).notNull(),
    lastSyncStatus: varchar("lastSyncStatus", { length: 255 }),
    errorType: varchar("errorType", { length: 255 }),
    lastSyncStartTime: timestamp("lastSyncStartTime", {
      withTimezone: true,
      mode: "string",
    }),
    lastSyncFinishTime: timestamp("lastSyncFinishTime", {
      withTimezone: true,
      mode: "string",
    }),
    lastSyncSuccessfulTime: timestamp("lastSyncSuccessfulTime", {
      withTimezone: true,
      mode: "string",
    }),
    firstSuccessfulSyncTime: timestamp("firstSuccessfulSyncTime", {
      withTimezone: true,
      mode: "string",
    }),
    firstSyncProgress: varchar("firstSyncProgress", { length: 255 }),
    lastGcTime: timestamp("lastGCTime", { withTimezone: true, mode: "string" }),
  },
  (table) => {
    return {
      workspaceIdDataSourceName: uniqueIndex(
        "connectors_workspace_id_data_source_name"
      ).on(table.workspaceId, table.dataSourceName),
    };
  }
);

export const slackChannels = pgTable(
  "slack_channels",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slackChannelId: varchar("slackChannelId", { length: 255 }).notNull(),
    slackChannelName: varchar("slackChannelName", { length: 255 }).notNull(),
    permission: varchar("permission", { length: 255 })
      .default("read_write")
      .notNull(),
    agentConfigurationId: varchar("agentConfigurationId", { length: 255 }),
  },
  (table) => {
    return {
      connectorId: index("slack_channels_connector_id").on(table.connectorId),
      connectorIdSlackChannelId: uniqueIndex(
        "slack_channels_connector_id_slack_channel_id"
      ).on(table.connectorId, table.slackChannelId),
    };
  }
);

export const notionPages = pgTable(
  "notion_pages",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    notionPageId: varchar("notionPageId", { length: 255 }).notNull(),
    lastSeenTs: timestamp("lastSeenTs", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastUpsertedTs: timestamp("lastUpsertedTs", {
      withTimezone: true,
      mode: "string",
    }),
    lastCreatedOrMovedRunTs: timestamp("lastCreatedOrMovedRunTs", {
      withTimezone: true,
      mode: "string",
    }),
    skipReason: varchar("skipReason", { length: 255 }),
    parentType: varchar("parentType", { length: 255 }),
    parentId: varchar("parentId", { length: 255 }),
    title: text("title"),
    // TODO: failed to parse database type 'tsvector'
    titleSearchVector: unknown("titleSearchVector"),
    notionUrl: varchar("notionUrl", { length: 255 }),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index("notion_pages_connector_id").on(table.connectorId),
      notionPageIdConnectorId: uniqueIndex(
        "notion_pages_notion_page_id_connector_id"
      ).on(table.notionPageId, table.connectorId),
      lastSeenTs: index("notion_pages_last_seen_ts").on(table.lastSeenTs),
      lastCreatedOrMovedRunTs: index(
        "notion_pages_last_created_or_moved_run_ts"
      ).on(table.lastCreatedOrMovedRunTs),
      parentId: index("notion_pages_parent_id").on(table.parentId),
      titleSearchVectorGistIdx: index(
        "notion_pages_title_search_vector_gist_idx"
      ).on(table.titleSearchVector),
    };
  }
);

export const slackChatBotMessages = pgTable(
  "slack_chat_bot_messages",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "string" }),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "string" }),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channelId: varchar("channelId", { length: 255 }).notNull(),
    messageTs: varchar("messageTs", { length: 255 }),
    threadTs: varchar("threadTs", { length: 255 }),
    chatSessionSid: varchar("chatSessionSid", { length: 255 }),
    message: text("message").notNull(),
    slackUserId: varchar("slackUserId", { length: 255 }).notNull(),
    slackEmail: varchar("slackEmail", { length: 255 }).notNull(),
    slackUserName: varchar("slackUserName", { length: 255 }).notNull(),
    slackTimezone: varchar("slackTimezone", { length: 255 }),
    completedAt: timestamp("completedAt", {
      withTimezone: true,
      mode: "string",
    }),
    conversationId: varchar("conversationId", { length: 255 }),
    slackFullName: varchar("slackFullName", { length: 255 }),
    slackAvatar: varchar("slackAvatar", { length: 255 }),
  },
  (table) => {
    return {
      connectorIdChannelIdThreadTs: index(
        "slack_chat_bot_messages_connector_id_channel_id_thread_ts"
      ).on(table.connectorId, table.channelId, table.threadTs),
    };
  }
);

export const confluenceConfigurations = pgTable(
  "confluence_configurations",
  {
    id: serial("id").primaryKey().notNull(),
    cloudId: varchar("cloudId", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    url: varchar("url", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    userAccountId: varchar("userAccountId", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      userAccountId: index("confluence_configurations_user_account_id").on(
        table.userAccountId
      ),
      connectorId: uniqueIndex("confluence_configurations_connector_id").on(
        table.connectorId
      ),
    };
  }
);

export const slackMessages = pgTable(
  "slack_messages",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channelId: varchar("channelId", { length: 255 }).notNull(),
    messageTs: varchar("messageTs", { length: 255 }),
    documentId: varchar("documentId", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      connectorIdChannelIdMessageTs: uniqueIndex(
        "slack_messages_connector_id_channel_id_message_ts"
      ).on(table.connectorId, table.channelId, table.messageTs),
    };
  }
);

export const slackConfigurations = pgTable(
  "slack_configurations",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    slackTeamId: varchar("slackTeamId", { length: 255 }).notNull(),
    botEnabled: boolean("botEnabled").default(false).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    whitelistedDomains: varchar("whitelistedDomains", { length: 255 }).array(),
  },
  (table) => {
    return {
      connectorId: uniqueIndex("slack_configurations_connector_id").on(
        table.connectorId
      ),
      slackTeamId: index("slack_configurations_slack_team_id").on(
        table.slackTeamId
      ),
      slackTeamIdBotEnabled: uniqueIndex(
        "slack_configurations_slack_team_id_bot_enabled"
      ).on(table.slackTeamId, table.botEnabled),
    };
  }
);

export const notionDatabases = pgTable(
  "notion_databases",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    notionDatabaseId: varchar("notionDatabaseId", { length: 255 }).notNull(),
    lastSeenTs: timestamp("lastSeenTs", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    firstSeenTs: timestamp("firstSeenTs", {
      withTimezone: true,
      mode: "string",
    }),
    lastCreatedOrMovedRunTs: timestamp("lastCreatedOrMovedRunTs", {
      withTimezone: true,
      mode: "string",
    }),
    skipReason: varchar("skipReason", { length: 255 }),
    parentType: varchar("parentType", { length: 255 }),
    parentId: varchar("parentId", { length: 255 }),
    title: text("title"),
    // TODO: failed to parse database type 'tsvector'
    titleSearchVector: unknown("titleSearchVector"),
    notionUrl: varchar("notionUrl", { length: 255 }),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      notionDatabaseIdConnectorId: uniqueIndex(
        "notion_databases_notion_database_id_connector_id"
      ).on(table.notionDatabaseId, table.connectorId),
      lastSeenTs: index("notion_databases_last_seen_ts").on(table.lastSeenTs),
      lastCreatedOrMovedRunTs: index(
        "notion_databases_last_created_or_moved_run_ts"
      ).on(table.lastCreatedOrMovedRunTs),
      connectorIdSkipReason: index(
        "notion_databases_connector_id_skip_reason"
      ).on(table.skipReason, table.connectorId),
      parentId: index("notion_databases_parent_id").on(table.parentId),
      titleSearchVectorGistIdx: index(
        "notion_databases_title_search_vector_gist_idx"
      ).on(table.titleSearchVector),
    };
  }
);

export const notionConnectorStates = pgTable(
  "notion_connector_states",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastGarbageCollectionFinishTime: timestamp(
      "lastGarbageCollectionFinishTime",
      { withTimezone: true, mode: "string" }
    ),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: uniqueIndex("notion_connector_states_connector_id").on(
        table.connectorId
      ),
    };
  }
);

export const githubIssues = pgTable(
  "github_issues",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    issueNumber: integer("issueNumber").notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index("github_issues_connector_id").on(table.connectorId),
      repoIdUpdatedAt: index("github_issues_repo_id_updated_at").on(
        table.updatedAt,
        table.repoId
      ),
      repoIdIssueNumberConnectorId: uniqueIndex(
        "github_issues_repo_id_issue_number_connector_id"
      ).on(table.repoId, table.issueNumber, table.connectorId),
    };
  }
);

export const githubConnectorStates = pgTable(
  "github_connector_states",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    webhooksEnabledAt: timestamp("webhooksEnabledAt", {
      withTimezone: true,
      mode: "string",
    }),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    codeSyncEnabled: boolean("codeSyncEnabled").default(false).notNull(),
  },
  (table) => {
    return {
      connectorId: uniqueIndex("github_connector_states_connector_id").on(
        table.connectorId
      ),
    };
  }
);

export const githubDiscussions = pgTable(
  "github_discussions",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    discussionNumber: integer("discussionNumber").notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index("github_discussions_connector_id").on(
        table.connectorId
      ),
      repoIdUpdatedAt: index("github_discussions_repo_id_updated_at").on(
        table.updatedAt,
        table.repoId
      ),
      repoIdDiscussionNumberConnectorId: uniqueIndex(
        "github_discussions_repo_id_discussion_number_connector_id"
      ).on(table.repoId, table.discussionNumber, table.connectorId),
    };
  }
);

export const googleDriveFolders = pgTable(
  "google_drive_folders",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    folderId: varchar("folderId", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      connectorIdFolderId: uniqueIndex(
        "google_drive_folders_connector_id_folder_id"
      ).on(table.connectorId, table.folderId),
    };
  }
);

export const googleDriveFiles = pgTable(
  "google_drive_files",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastSeenTs: timestamp("lastSeenTs", { withTimezone: true, mode: "string" }),
    lastUpsertedTs: timestamp("lastUpsertedTs", {
      withTimezone: true,
      mode: "string",
    }),
    skipReason: varchar("skipReason", { length: 255 }),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    dustFileId: varchar("dustFileId", { length: 255 }).notNull(),
    driveFileId: varchar("driveFileId", { length: 255 }).notNull(),
    name: text("name").default("").notNull(),
    mimeType: varchar("mimeType", { length: 255 }).default("").notNull(),
    parentId: varchar("parentId", { length: 255 }),
  },
  (table) => {
    return {
      connectorIdDriveFileId: uniqueIndex(
        "google_drive_files_connector_id_drive_file_id"
      ).on(table.connectorId, table.driveFileId),
    };
  }
);

export const googleDriveSyncTokens = pgTable(
  "google_drive_sync_tokens",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    driveId: varchar("driveId", { length: 255 }).notNull(),
    syncToken: varchar("syncToken", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      connectorIdDriveId: uniqueIndex(
        "google_drive_sync_tokens_connector_id_drive_id"
      ).on(table.connectorId, table.driveId),
    };
  }
);

export const notionConnectorBlockCacheEntries = pgTable(
  "notion_connector_block_cache_entries",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    notionPageId: varchar("notionPageId", { length: 255 }).notNull(),
    notionBlockId: varchar("notionBlockId", { length: 255 }).notNull(),
    blockText: text("blockText"),
    blockType: varchar("blockType", { length: 255 }).notNull(),
    parentBlockId: varchar("parentBlockId", { length: 255 }),
    indexInParent: integer("indexInParent").notNull(),
    childDatabaseTitle: varchar("childDatabaseTitle", { length: 255 }),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index(
        "notion_connector_block_cache_entries_connector_id"
      ).on(table.connectorId),
      notionPageId: index(
        "notion_connector_block_cache_entries_notion_page_id"
      ).on(table.notionPageId),
      uqNotionBlockIdConnIdPageId: uniqueIndex(
        "uq_notion_block_id_conn_id_page_id"
      ).on(table.notionPageId, table.notionBlockId, table.connectorId),
      parentBlockId: index(
        "notion_connector_block_cache_entries_parent_block_id"
      ).on(table.parentBlockId),
    };
  }
);

export const googleDriveWebhooks = pgTable(
  "google_drive_webhooks",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    webhookId: varchar("webhookId", { length: 255 }).notNull(),
    renewedByWebhookId: varchar("renewedByWebhookId", { length: 255 }),
    expiresAt: timestamp("expiresAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    renewAt: timestamp("renewAt", { withTimezone: true, mode: "string" }),
  },
  (table) => {
    return {
      connectorId: index("google_drive_webhooks_connector_id").on(
        table.connectorId
      ),
      webhookId: uniqueIndex("google_drive_webhooks_webhook_id").on(
        table.webhookId
      ),
      renewAt: index("google_drive_webhooks_renew_at").on(table.renewAt),
    };
  }
);

export const notionConnectorPageCacheEntries = pgTable(
  "notion_connector_page_cache_entries",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    notionPageId: varchar("notionPageId", { length: 255 }).notNull(),
    pageProperties: jsonb("pageProperties"),
    pagePropertiesText: text("pagePropertiesText").default("{}").notNull(),
    parentId: varchar("parentId", { length: 255 }),
    parentType: varchar("parentType", { length: 255 }).notNull(),
    lastEditedById: varchar("lastEditedById", { length: 255 }).notNull(),
    createdById: varchar("createdById", { length: 255 }).notNull(),
    createdTime: varchar("createdTime", { length: 255 }).notNull(),
    lastEditedTime: varchar("lastEditedTime", { length: 255 }).notNull(),
    url: varchar("url", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index("notion_connector_page_cache_entries_connector_id").on(
        table.connectorId
      ),
      notionPageIdConnectorId: uniqueIndex(
        "notion_connector_page_cache_entries_notion_page_id_connector_id"
      ).on(table.notionPageId, table.connectorId),
      parentId: index("notion_connector_page_cache_entries_parent_id").on(
        table.parentId
      ),
    };
  }
);

export const notionConnectorResourcesToCheckCacheEntries = pgTable(
  "notion_connector_resources_to_check_cache_entries",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    notionId: varchar("notionId", { length: 255 }).notNull(),
    resourceType: varchar("resourceType", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index(
        "notion_connector_resources_to_check_cache_entries_connector_id"
      ).on(table.connectorId),
      uqNotionToCheckNotionIdConnId: uniqueIndex(
        "uq_notion_to_check_notion_id_conn_id"
      ).on(table.notionId, table.connectorId),
    };
  }
);

export const googleDriveConfigs = pgTable(
  "google_drive_configs",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId").notNull(),
    pdfEnabled: boolean("pdfEnabled").default(false).notNull(),
  },
  (table) => {
    return {
      connectorId: uniqueIndex("google_drive_configs_connector_id").on(
        table.connectorId
      ),
    };
  }
);

export const githubCodeDirectories = pgTable(
  "github_code_directories",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastSeenAt: timestamp("lastSeenAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    internalId: varchar("internalId", { length: 255 }).notNull(),
    parentInternalId: varchar("parentInternalId", { length: 255 }).notNull(),
    dirName: varchar("dirName", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    codeUpdatedAt: timestamp("codeUpdatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return {
      connectorIdRepoIdLastSeenAt: index(
        "github_code_directories_connector_id_repo_id_last_seen_at"
      ).on(table.lastSeenAt, table.repoId, table.connectorId),
      connectorIdRepoIdInternalId: uniqueIndex(
        "github_code_directories_connector_id_repo_id_internal_id"
      ).on(table.repoId, table.internalId, table.connectorId),
    };
  }
);

export const webcrawlerConfigurations = pgTable("webcrawler_configurations", {
  id: serial("id").primaryKey().notNull(),
  createdAt: timestamp("createdAt", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  updatedAt: timestamp("updatedAt", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  url: varchar("url", { length: 255 }).notNull(),
  connectorId: integer("connectorId").references(() => connectors.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
});

export const intercomCollections = pgTable(
  "intercom_collections",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    intercomWorkspaceId: varchar("intercomWorkspaceId", {
      length: 255,
    }).notNull(),
    collectionId: varchar("collectionId", { length: 255 }).notNull(),
    helpCenterId: varchar("helpCenterId", { length: 255 }).notNull(),
    parentId: varchar("parentId", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 255 }),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    url: varchar("url", { length: 255 }).notNull(),
    lastUpsertedTs: timestamp("lastUpsertedTs", {
      withTimezone: true,
      mode: "string",
    }),
    permission: varchar("permission", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      connectorId: index("intercom_collections_connector_id").on(
        table.connectorId
      ),
      collectionId: index("intercom_collections_collection_id").on(
        table.collectionId
      ),
      intercomConnectorCollectionIdx: uniqueIndex(
        "intercom_connector_collection_idx"
      ).on(table.collectionId, table.connectorId),
      intercomWorkspaceCollectionConnectorIdx: uniqueIndex(
        "intercom_workspace_collection_connector_idx"
      ).on(table.intercomWorkspaceId, table.collectionId, table.connectorId),
    };
  }
);

export const intercomArticles = pgTable(
  "intercom_articles",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    intercomWorkspaceId: varchar("intercomWorkspaceId", {
      length: 255,
    }).notNull(),
    articleId: varchar("articleId", { length: 255 }).notNull(),
    authorId: varchar("authorId", { length: 255 }).notNull(),
    parentId: varchar("parentId", { length: 255 }),
    parentType: varchar("parentType", { length: 255 }),
    state: varchar("state", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    url: varchar("url", { length: 255 }).notNull(),
    parents: varchar("parents", { length: 255 }).array().notNull(),
    lastUpsertedTs: timestamp("lastUpsertedTs", {
      withTimezone: true,
      mode: "string",
    }),
    permission: varchar("permission", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      connectorId: index("intercom_articles_connector_id").on(
        table.connectorId
      ),
      articleId: index("intercom_articles_article_id").on(table.articleId),
      intercomConnectorArticleIdx: uniqueIndex(
        "intercom_connector_article_idx"
      ).on(table.articleId, table.connectorId),
      intercomWorkspaceArticleConnectorIdx: uniqueIndex(
        "intercom_workspace_article_connector_idx"
      ).on(table.intercomWorkspaceId, table.articleId, table.connectorId),
    };
  }
);

export const webcrawlerFolders = pgTable(
  "webcrawler_folders",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    url: text("url").notNull(),
    parentUrl: text("parentUrl"),
    internalId: varchar("internalId", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    webcrawlerConfigurationId: integer("webcrawlerConfigurationId").references(
      () => webcrawlerConfigurations.id,
      { onDelete: "set null", onUpdate: "cascade" }
    ),
  },
  (table) => {
    return {
      urlConnectorIdWebcrawlerConfigurationId: uniqueIndex(
        "webcrawler_folders_url_connector_id_webcrawler_configuration_id"
      ).on(table.url, table.connectorId, table.webcrawlerConfigurationId),
    };
  }
);

export const intercomHelpCenters = pgTable(
  "intercom_help_centers",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    intercomWorkspaceId: varchar("intercomWorkspaceId", {
      length: 255,
    }).notNull(),
    helpCenterId: varchar("helpCenterId", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    lastUpsertedTs: timestamp("lastUpsertedTs", {
      withTimezone: true,
      mode: "string",
    }),
    permission: varchar("permission", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => {
    return {
      connectorId: index("intercom_help_centers_connector_id").on(
        table.connectorId
      ),
      intercomConnectorHelpCenterIdx: uniqueIndex(
        "intercom_connector_help_center_idx"
      ).on(table.helpCenterId, table.connectorId),
      helpCenterId: index("intercom_help_centers_help_center_id").on(
        table.helpCenterId
      ),
    };
  }
);

export const webcrawlerPages = pgTable(
  "webcrawler_pages",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    url: text("url").notNull(),
    title: text("title"),
    parentUrl: text("parentUrl"),
    documentId: varchar("documentId", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    webcrawlerConfigurationId: integer("webcrawlerConfigurationId").references(
      () => webcrawlerConfigurations.id,
      { onDelete: "set null", onUpdate: "cascade" }
    ),
  },
  (table) => {
    return {
      urlConnectorIdWebcrawlerConfigurationId: uniqueIndex(
        "webcrawler_pages_url_connector_id_webcrawler_configuration_id"
      ).on(table.url, table.connectorId, table.webcrawlerConfigurationId),
    };
  }
);

export const confluenceConnectorStates = pgTable(
  "confluence_connector_states",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    cloudId: varchar("cloudId", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    url: varchar("url", { length: 255 }).notNull(),
  },
  (table) => {
    return {
      connectorId: uniqueIndex("confluence_connector_states_connector_id").on(
        table.connectorId
      ),
    };
  }
);

export const confluenceSpaces = pgTable(
  "confluence_spaces",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    connectorId: integer("connectorId")
      .notNull()
      .references(() => connectors.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    spaceId: varchar("spaceId", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    urlSuffix: varchar("urlSuffix", { length: 255 }),
  },
  (table) => {
    return {
      connectorIdSpaceId: uniqueIndex(
        "confluence_spaces_connector_id_space_id"
      ).on(table.connectorId, table.spaceId),
    };
  }
);

export const confluencePages = pgTable(
  "confluence_pages",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    version: integer("version").notNull(),
    skipReason: varchar("skipReason", { length: 255 }),
    parentId: varchar("parentId", { length: 255 }),
    pageId: varchar("pageId", { length: 255 }).notNull(),
    spaceId: varchar("spaceId", { length: 255 }).notNull(),
    title: text("title").notNull(),
    externalUrl: varchar("externalUrl", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    lastVisitedAt: timestamp("lastVisitedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return {
      connectorId: index("confluence_pages_connector_id").on(table.connectorId),
      parentId: index("confluence_pages_parent_id").on(table.parentId),
      connectorIdPageId: uniqueIndex(
        "confluence_pages_connector_id_page_id"
      ).on(table.pageId, table.connectorId),
      spaceId: index("confluence_pages_space_id").on(table.spaceId),
      connectorIdSpaceId: index("confluence_pages_connector_id_space_id").on(
        table.spaceId,
        table.connectorId
      ),
      connectorIdLastVisitedAt: index(
        "confluence_pages_connector_id_last_visited_at"
      ).on(table.connectorId, table.lastVisitedAt),
    };
  }
);

export const githubCodeRepositories = pgTable(
  "github_code_repositories",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastSeenAt: timestamp("lastSeenAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    repoLogin: varchar("repoLogin", { length: 255 }).notNull(),
    repoName: varchar("repoName", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    codeUpdatedAt: timestamp("codeUpdatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return {
      connectorIdRepoId: uniqueIndex(
        "github_code_repositories_connector_id_repo_id"
      ).on(table.repoId, table.connectorId),
    };
  }
);

export const githubCodeFiles = pgTable(
  "github_code_files",
  {
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastSeenAt: timestamp("lastSeenAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    documentId: varchar("documentId", { length: 255 }).notNull(),
    parentInternalId: varchar("parentInternalId", { length: 255 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 255 }).notNull(),
    contentHash: varchar("contentHash", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    codeUpdatedAt: timestamp("codeUpdatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return {
      connectorIdRepoIdLastSeenAt: index(
        "github_code_files_connector_id_repo_id_last_seen_at"
      ).on(table.lastSeenAt, table.repoId, table.connectorId),
      connectorIdRepoIdDocumentId: uniqueIndex(
        "github_code_files_connector_id_repo_id_document_id"
      ).on(table.repoId, table.documentId, table.connectorId),
    };
  }
);
