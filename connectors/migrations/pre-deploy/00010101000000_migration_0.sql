CREATE TABLE IF NOT EXISTS "connectors"
(
    "createdAt"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "type"                    VARCHAR(255)             NOT NULL,
    "connectionId"            VARCHAR(255)             NOT NULL,
    "useProxy"                BOOLEAN DEFAULT false,
    "workspaceAPIKey"         VARCHAR(255)             NOT NULL,
    "workspaceId"             VARCHAR(255)             NOT NULL,
    "dataSourceId"            VARCHAR(255)             NOT NULL,
    "lastSyncStatus"          VARCHAR(255),
    "errorType"               VARCHAR(255),
    "lastSyncStartTime"       TIMESTAMP WITH TIME ZONE,
    "lastSyncFinishTime"      TIMESTAMP WITH TIME ZONE,
    "lastSyncSuccessfulTime"  TIMESTAMP WITH TIME ZONE,
    "firstSuccessfulSyncTime" TIMESTAMP WITH TIME ZONE,
    "firstSyncProgress"       VARCHAR(255),
    "lastGCTime"              TIMESTAMP WITH TIME ZONE,
    "pausedAt"                TIMESTAMP WITH TIME ZONE,
    "metadata"                JSONB,
    "id"                      BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connectors_workspace_id_data_source_id" ON "connectors" ("workspaceId", "dataSourceId")

CREATE TABLE IF NOT EXISTS "confluence_configurations"
(
    "cloudId"       VARCHAR(255)             NOT NULL,
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "url"           VARCHAR(255)             NOT NULL,
    "userAccountId" VARCHAR(255)             NOT NULL,
    "connectorId"   BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confluence_configurations_connector_id" ON "confluence_configurations" ("connectorId")
CREATE INDEX "confluence_configurations_user_account_id" ON "confluence_configurations" ("userAccountId")

CREATE TABLE IF NOT EXISTS "confluence_folders"
(
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastVisitedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "version"       INTEGER                  NOT NULL,
    "skipReason"    VARCHAR(255),
    "parentId"      VARCHAR(255) DEFAULT NULL,
    "parentType"    VARCHAR(255) DEFAULT NULL,
    "folderId"      VARCHAR(255)             NOT NULL,
    "spaceId"       VARCHAR(255)             NOT NULL,
    "title"         TEXT                     NOT NULL,
    "externalUrl"   VARCHAR(255)             NOT NULL,
    "connectorId"   BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confluence_folders_connector_id_folder_id" ON "confluence_folders" ("connectorId", "folderId")
CREATE INDEX "confluence_folders_connector_id_space_id_parent_id" ON "confluence_folders" ("connectorId", "spaceId", "parentId")
CREATE INDEX "confluence_folders_connector_id_last_visited_at" ON "confluence_folders" ("connectorId", "lastVisitedAt")

CREATE TABLE IF NOT EXISTS "confluence_pages"
(
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastVisitedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "version"       INTEGER                  NOT NULL,
    "skipReason"    VARCHAR(255),
    "parentId"      VARCHAR(255) DEFAULT NULL,
    "parentType"    VARCHAR(255) DEFAULT NULL,
    "pageId"        VARCHAR(255)             NOT NULL,
    "spaceId"       VARCHAR(255)             NOT NULL,
    "title"         TEXT                     NOT NULL,
    "externalUrl"   VARCHAR(255)             NOT NULL,
    "connectorId"   BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confluence_pages_connector_id_page_id" ON "confluence_pages" ("connectorId", "pageId")
CREATE INDEX "confluence_pages_connector_id_space_id_parent_id" ON "confluence_pages" ("connectorId", "spaceId", "parentId")
CREATE INDEX "confluence_pages_connector_id_last_visited_at" ON "confluence_pages" ("connectorId", "lastVisitedAt")

CREATE TABLE IF NOT EXISTS "confluence_spaces"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"        VARCHAR(255)             NOT NULL,
    "spaceId"     VARCHAR(255)             NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "urlSuffix"   VARCHAR(255),
    "deletedAt"   TIMESTAMP WITH TIME ZONE,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confluence_spaces_connector_id_space_id" ON "confluence_spaces" ("connectorId", "spaceId")

CREATE TABLE IF NOT EXISTS "discord_configurations"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "guildId"     VARCHAR(255)             NOT NULL,
    "botEnabled"  BOOLEAN                  NOT NULL DEFAULT false,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX "discord_configurations_guild_id" ON "discord_configurations" ("guildId")
CREATE UNIQUE INDEX "discord_configurations_connector_id" ON "discord_configurations" ("connectorId")
CREATE UNIQUE INDEX "discord_configurations_guild_id_bot_enabled" ON "discord_configurations" ("guildId", "botEnabled") WHERE "botEnabled" = true

CREATE TABLE IF NOT EXISTS "slack_configurations"
(
    "createdAt"                      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                      TIMESTAMP WITH TIME ZONE NOT NULL,
    "slackTeamId"                    VARCHAR(255)             NOT NULL,
    "botEnabled"                     BOOLEAN                  NOT NULL DEFAULT false,
    "whitelistedDomains"             VARCHAR(255)[],
    "autoReadChannelPatterns"        JSONB                             DEFAULT '[]',
    "restrictedSpaceAgentsEnabled"   BOOLEAN                  NOT NULL DEFAULT true,
    "feedbackVisibleToAuthorOnly"    BOOLEAN                  NOT NULL DEFAULT true,
    "privateIntegrationCredentialId" VARCHAR(255),
    "connectorId"                    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX "slack_configurations_slack_team_id" ON "slack_configurations" ("slackTeamId")
CREATE UNIQUE INDEX "slack_configurations_connector_id" ON "slack_configurations" ("connectorId")
CREATE UNIQUE INDEX "slack_configurations_slack_team_id_bot_enabled" ON "slack_configurations" ("slackTeamId", "botEnabled") WHERE "botEnabled" = true

CREATE TABLE IF NOT EXISTS "slack_messages"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "channelId"   VARCHAR(255)             NOT NULL,
    "messageTs"   VARCHAR(255),
    "documentId"  VARCHAR(255)             NOT NULL,
    "skipReason"  VARCHAR(255),
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_messages_connector_id_channel_id_document_id" ON "slack_messages" ("connectorId", "channelId", "documentId")

CREATE TABLE IF NOT EXISTS "slack_channels"
(
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "slackChannelId"            VARCHAR(255)             NOT NULL,
    "slackChannelName"          VARCHAR(255)             NOT NULL,
    "skipReason"                VARCHAR(255),
    "private"                   BOOLEAN                  NOT NULL,
    "permission"                VARCHAR(255)             NOT NULL DEFAULT 'read_write',
    "agentConfigurationId"      VARCHAR(255),
    "autoRespondWithoutMention" BOOLEAN                  NOT NULL DEFAULT false,
    "connectorId"               BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                        BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_channels_connector_id_slack_channel_id" ON "slack_channels" ("connectorId", "slackChannelId")
CREATE INDEX "slack_channels_connector_id" ON "slack_channels" ("connectorId")

CREATE TABLE IF NOT EXISTS "slack_chat_bot_messages"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE,
    "updatedAt"      TIMESTAMP WITH TIME ZONE,
    "channelId"      VARCHAR(255) NOT NULL,
    "messageTs"      VARCHAR(255),
    "threadTs"       VARCHAR(255),
    "chatSessionSid" VARCHAR(255),
    "message"        TEXT         NOT NULL,
    "slackUserId"    VARCHAR(255) NOT NULL,
    "slackEmail"     VARCHAR(255) NOT NULL,
    "slackUserName"  VARCHAR(255) NOT NULL,
    "slackTimezone"  VARCHAR(255),
    "completedAt"    TIMESTAMP WITH TIME ZONE,
    "conversationId" VARCHAR(255),
    "slackFullName"  VARCHAR(255),
    "slackAvatar"    VARCHAR(255),
    "userType"       VARCHAR(255),
    "connectorId"    BIGINT       NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX "slack_chat_bot_messages_connector_id_channel_id_thread_ts" ON "slack_chat_bot_messages" ("connectorId", "channelId", "threadTs")

CREATE TABLE IF NOT EXISTS "slack_bot_whitelist"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "botName"              VARCHAR(255)             NOT NULL,
    "whitelistType"        VARCHAR(255)             NOT NULL DEFAULT 'summon_agent',
    "groupIds"             VARCHAR(255)[],
    "connectorId"          BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "slackConfigurationId" BIGINT REFERENCES "slack_configurations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_bot_whitelist_connector_id_bot_name" ON "slack_bot_whitelist" ("connectorId", "botName")

CREATE TABLE IF NOT EXISTS "notion_pages"
(
    "createdAt"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "notionPageId"            VARCHAR(255)             NOT NULL,
    "lastSeenTs"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastUpsertedTs"          TIMESTAMP WITH TIME ZONE,
    "lastCreatedOrMovedRunTs" TIMESTAMP WITH TIME ZONE,
    "skipReason"              VARCHAR(255),
    "parentType"              VARCHAR(255),
    "parentId"                VARCHAR(255),
    "title"                   TEXT,
    "titleSearchVector"       TSVECTOR,
    "notionUrl"               VARCHAR(255),
    "connectorId"             BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                      BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notion_pages_notion_page_id_connector_id" ON "notion_pages" ("notionPageId", "connectorId")
CREATE INDEX "notion_pages_parent_id" ON "notion_pages" ("parentId")
CREATE INDEX "notion_pages_last_created_or_moved_run_ts" ON "notion_pages" ("lastCreatedOrMovedRunTs")
CREATE INDEX "notion_pages_title_search_vector_gist_idx" ON "notion_pages" USING gist ("titleSearchVector")
CREATE INDEX CONCURRENTLY "notion_pages_connector_id" ON "notion_pages" ("connectorId")
CREATE INDEX CONCURRENTLY "notion_pages_connector_id_last_seen_ts" ON "notion_pages" ("connectorId", "lastSeenTs")

CREATE TABLE IF NOT EXISTS "notion_databases"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "notionDatabaseId"         VARCHAR(255)             NOT NULL,
    "lastSeenTs"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "firstSeenTs"              TIMESTAMP WITH TIME ZONE,
    "lastCreatedOrMovedRunTs"  TIMESTAMP WITH TIME ZONE,
    "lastUpsertedRunTs"        TIMESTAMP WITH TIME ZONE,
    "upsertRequestedRunTs"     TIMESTAMP WITH TIME ZONE,
    "skipReason"               VARCHAR(255),
    "parentType"               VARCHAR(255),
    "parentId"                 VARCHAR(255),
    "title"                    TEXT,
    "titleSearchVector"        TSVECTOR,
    "notionUrl"                VARCHAR(255),
    "structuredDataEnabled"    BOOLEAN                  NOT NULL DEFAULT false,
    "structuredDataUpsertedTs" TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "connectorId"              BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notion_databases_notion_database_id_connector_id" ON "notion_databases" ("notionDatabaseId", "connectorId")
CREATE INDEX "notion_databases_connector_id_skip_reason" ON "notion_databases" ("connectorId", "skipReason")
CREATE INDEX "notion_databases_last_seen_ts" ON "notion_databases" ("lastSeenTs")
CREATE INDEX "notion_databases_last_created_or_moved_run_ts" ON "notion_databases" ("lastCreatedOrMovedRunTs")
CREATE INDEX "notion_databases_parent_id" ON "notion_databases" ("parentId")
CREATE INDEX "notion_databases_title_search_vector_gist_idx" ON "notion_databases" USING gist ("titleSearchVector")
CREATE INDEX CONCURRENTLY "notion_databases_connector_id" ON "notion_databases" ("connectorId")
CREATE INDEX CONCURRENTLY "notion_databases_connector_id_last_seen_ts" ON "notion_databases" ("connectorId", "lastSeenTs")

CREATE TABLE IF NOT EXISTS "notion_connector_states"
(
    "createdAt"                       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                       TIMESTAMP WITH TIME ZONE NOT NULL,
    "fullResyncStartTime"             TIMESTAMP WITH TIME ZONE,
    "lastGarbageCollectionFinishTime" TIMESTAMP WITH TIME ZONE,
    "parentsLastUpdatedAt"            TIMESTAMP WITH TIME ZONE,
    "notionWorkspaceId"               VARCHAR(255)             NOT NULL,
    "privateIntegrationCredentialId"  VARCHAR(255),
    "connectorId"                     BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notion_connector_states_connector_id" ON "notion_connector_states" ("connectorId")

CREATE TABLE IF NOT EXISTS "github_connector_states"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "installationId"    VARCHAR(255),
    "webhooksEnabledAt" TIMESTAMP WITH TIME ZONE,
    "codeSyncEnabled"   BOOLEAN                  NOT NULL DEFAULT false,
    "connectorId"       BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_connector_states_connector_id" ON "github_connector_states" ("connectorId")
CREATE INDEX "github_connector_states_installation_id" ON "github_connector_states" ("installationId")

CREATE TABLE IF NOT EXISTS "github_issues"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "skipReason"  VARCHAR(255),
    "repoId"      VARCHAR(255)             NOT NULL,
    "issueNumber" INTEGER                  NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_issues_repo_id_issue_number_connector_id" ON "github_issues" ("repoId", "issueNumber", "connectorId")
CREATE INDEX "github_issues_connector_id" ON "github_issues" ("connectorId")
CREATE INDEX "github_issues_repo_id_updated_at" ON "github_issues" ("repoId", "updatedAt")

CREATE TABLE IF NOT EXISTS "github_discussions"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "repoId"           VARCHAR(255)             NOT NULL,
    "discussionNumber" INTEGER                  NOT NULL,
    "connectorId"      BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_discussions_repo_id_discussion_number_connector_id" ON "github_discussions" ("repoId", "discussionNumber", "connectorId")
CREATE INDEX "github_discussions_connector_id" ON "github_discussions" ("connectorId")
CREATE INDEX "github_discussions_repo_id_updated_at" ON "github_discussions" ("repoId", "updatedAt")

CREATE TABLE IF NOT EXISTS "github_code_repositories"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastSeenAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "codeUpdatedAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
    "forceDailySync" BOOLEAN                  NOT NULL DEFAULT false,
    "skipReason"     VARCHAR(255),
    "repoId"         VARCHAR(255)             NOT NULL,
    "repoLogin"      VARCHAR(255)             NOT NULL,
    "repoName"       VARCHAR(255)             NOT NULL,
    "sourceUrl"      TEXT                     NOT NULL,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_code_repositories_connector_id_repo_id" ON "github_code_repositories" ("connectorId", "repoId")

CREATE TABLE IF NOT EXISTS "github_code_files"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastSeenAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "codeUpdatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "repoId"           VARCHAR(255)             NOT NULL,
    "documentId"       VARCHAR(255)             NOT NULL,
    "parentInternalId" VARCHAR(255)             NOT NULL,
    "fileName"         VARCHAR(255)             NOT NULL,
    "sourceUrl"        TEXT                     NOT NULL,
    "contentHash"      VARCHAR(255)             NOT NULL,
    "skipReason"       VARCHAR(255),
    "connectorId"      BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_code_files_connector_id_repo_id_document_id" ON "github_code_files" ("connectorId", "repoId", "documentId")
CREATE INDEX "github_code_files_connector_id_repo_id_last_seen_at" ON "github_code_files" ("connectorId", "repoId", "lastSeenAt")

CREATE TABLE IF NOT EXISTS "github_code_directories"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastSeenAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "codeUpdatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "repoId"           VARCHAR(255)             NOT NULL,
    "internalId"       VARCHAR(255)             NOT NULL,
    "parentInternalId" VARCHAR(255)             NOT NULL,
    "dirName"          VARCHAR(255)             NOT NULL,
    "sourceUrl"        TEXT                     NOT NULL,
    "connectorId"      BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_code_directories_connector_id_repo_id_internal_id" ON "github_code_directories" ("connectorId", "repoId", "internalId")
CREATE INDEX "github_code_directories_connector_id_repo_id_last_seen_at" ON "github_code_directories" ("connectorId", "repoId", "lastSeenAt")

CREATE TABLE IF NOT EXISTS "google_drive_folders"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "folderId"    VARCHAR(255)             NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_folders_connector_id_folder_id" ON "google_drive_folders" ("connectorId", "folderId")

CREATE TABLE IF NOT EXISTS "google_drive_files"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastSeenTs"     TIMESTAMP WITH TIME ZONE,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "skipReason"     VARCHAR(255),
    "dustFileId"     VARCHAR(255)             NOT NULL,
    "driveFileId"    VARCHAR(255)             NOT NULL,
    "name"           TEXT                     NOT NULL DEFAULT '',
    "mimeType"       VARCHAR(255)             NOT NULL DEFAULT '',
    "parentId"       VARCHAR(255),
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_files_connector_id_drive_file_id" ON "google_drive_files" ("connectorId", "driveFileId")
CREATE INDEX CONCURRENTLY "google_drive_files_connector_id_parent_id" ON "google_drive_files" ("connectorId", "parentId")

CREATE TABLE IF NOT EXISTS "google_drive_sheets"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "driveFileId"       VARCHAR(255)             NOT NULL,
    "driveSheetId"      INTEGER                  NOT NULL,
    "name"              TEXT                     NOT NULL,
    "notUpsertedReason" TEXT,
    "connectorId"       BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_sheets_connector_id_drive_file_id_drive_sheet_id" ON "google_drive_sheets" ("connectorId", "driveFileId", "driveSheetId")

CREATE TABLE IF NOT EXISTS "google_drive_sync_tokens"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "driveId"              VARCHAR(255)             NOT NULL,
    "syncToken"            VARCHAR(255)             NOT NULL,
    "lastSyncAt"           TIMESTAMP WITH TIME ZONE,
    "lastRelevantChangeAt" TIMESTAMP WITH TIME ZONE,
    "connectorId"          BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_sync_tokens_connector_id_drive_id" ON "google_drive_sync_tokens" ("connectorId", "driveId")

CREATE TABLE IF NOT EXISTS "microsoft_configurations"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "pdfEnabled"               BOOLEAN                  NOT NULL DEFAULT false,
    "csvEnabled"               BOOLEAN                  NOT NULL DEFAULT false,
    "largeFilesEnabled"        BOOLEAN                  NOT NULL DEFAULT false,
    "tenantId"                 VARCHAR(255),
    "selectedSites"            JSONB                             DEFAULT NULL,
    "allowedSensitivityLabels" JSONB                             DEFAULT NULL,
    "connectorId"              BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "microsoft_configurations_connector_id" ON "microsoft_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "microsoft_roots"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "internalId"  VARCHAR(255)             NOT NULL,
    "nodeType"    VARCHAR(255)             NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "microsoft_roots_connector_id_internal_id" ON "microsoft_roots" ("connectorId", "internalId")
CREATE INDEX "microsoft_roots_connector_id_node_type" ON "microsoft_roots" ("connectorId", "nodeType")

CREATE TABLE IF NOT EXISTS "microsoft_nodes"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastSeenTs"       TIMESTAMP WITH TIME ZONE,
    "lastUpsertedTs"   TIMESTAMP WITH TIME ZONE,
    "skipReason"       VARCHAR(255),
    "internalId"       VARCHAR(512)             NOT NULL,
    "nodeType"         VARCHAR(255)             NOT NULL,
    "name"             TEXT,
    "mimeType"         VARCHAR(255),
    "parentInternalId" VARCHAR(512),
    "deltaLink"        VARCHAR(1024),
    "webUrl"           VARCHAR(1024),
    "connectorId"      BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "microsoft_nodes_internal_id_connector_id" ON "microsoft_nodes" ("internalId", "connectorId")
CREATE INDEX "microsoft_nodes_connector_id_node_type" ON "microsoft_nodes" ("connectorId", "nodeType")
CREATE INDEX "microsoft_nodes_connector_id_id" ON "microsoft_nodes" ("connectorId", "id")
CREATE INDEX CONCURRENTLY "microsoft_nodes_parent_internal_id_connector_id" ON "microsoft_nodes" ("parentInternalId", "connectorId")

CREATE TABLE IF NOT EXISTS "microsoft_bot_configurations"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "botEnabled"  BOOLEAN                  NOT NULL DEFAULT false,
    "tenantId"    VARCHAR(255)             NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "microsoft_bot_configurations_connector_id" ON "microsoft_bot_configurations" ("connectorId")
CREATE UNIQUE INDEX "microsoft_bot_configurations_tenant_id" ON "microsoft_bot_configurations" ("tenantId")

CREATE TABLE IF NOT EXISTS "microsoft_bot_messages"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "userAadObjectId"    VARCHAR(255),
    "email"              VARCHAR(255),
    "conversationId"     VARCHAR(255)             NOT NULL,
    "userActivityId"     VARCHAR(255)             NOT NULL,
    "agentActivityId"    VARCHAR(255)             NOT NULL,
    "replyToId"          VARCHAR(255),
    "dustConversationId" VARCHAR(255),
    "dustAgentMessageId" VARCHAR(255),
    "connectorId"        BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX "microsoft_bot_messages_connector_id" ON "microsoft_bot_messages" ("connectorId")
CREATE INDEX "microsoft_bot_messages_connector_id_conversation_id" ON "microsoft_bot_messages" ("connectorId", "conversationId")
CREATE INDEX "microsoft_bot_messages_connector_id_dust_conversation_id" ON "microsoft_bot_messages" ("connectorId", "dustConversationId")

CREATE TABLE IF NOT EXISTS "notion_connector_block_cache_entries"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "notionPageId"       VARCHAR(255)             NOT NULL,
    "notionBlockId"      VARCHAR(255)             NOT NULL,
    "blockText"          TEXT,
    "blockType"          VARCHAR(255)             NOT NULL,
    "parentBlockId"      VARCHAR(255),
    "indexInParent"      INTEGER                  NOT NULL,
    "childDatabaseTitle" TEXT,
    "workflowId"         VARCHAR(255)             NOT NULL,
    "connectorId"        BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_notion_block_id_conn_id_page_id_wf_id" ON "notion_connector_block_cache_entries" ("notionBlockId", "connectorId", "notionPageId", "workflowId")
CREATE INDEX "notion_connector_block_cache_entries_connector_id" ON "notion_connector_block_cache_entries" ("connectorId")
CREATE INDEX "notion_connector_block_cache_entries_connector_id_workflow_id" ON "notion_connector_block_cache_entries" ("connectorId", "workflowId")
CREATE INDEX "notion_connector_block_cache_entries_connector_page_workflow" ON "notion_connector_block_cache_entries" ("connectorId", "notionPageId", "workflowId")

CREATE TABLE IF NOT EXISTS "notion_connector_page_cache_entries"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "notionPageId"       VARCHAR(255)             NOT NULL,
    "pageProperties"     JSONB,
    "pagePropertiesText" TEXT                     NOT NULL DEFAULT '{}',
    "parentId"           VARCHAR(255),
    "parentType"         VARCHAR(255)             NOT NULL,
    "lastEditedById"     VARCHAR(255)             NOT NULL,
    "createdById"        VARCHAR(255)             NOT NULL,
    "createdTime"        VARCHAR(255)             NOT NULL,
    "lastEditedTime"     VARCHAR(255)             NOT NULL,
    "url"                VARCHAR(255)             NOT NULL,
    "workflowId"         VARCHAR(255)             NOT NULL,
    "connectorId"        BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_notion_page_id_conn_id_wf_id" ON "notion_connector_page_cache_entries" ("notionPageId", "connectorId", "workflowId")
CREATE INDEX "notion_connector_page_cache_entries_connector_id" ON "notion_connector_page_cache_entries" ("connectorId")
CREATE INDEX "notion_connector_page_cache_entries_parent_id" ON "notion_connector_page_cache_entries" ("parentId")
CREATE INDEX "notion_connector_page_cache_entries_workflow_id" ON "notion_connector_page_cache_entries" ("workflowId")

CREATE TABLE IF NOT EXISTS "notion_connector_resources_to_check_cache_entries"
(
    "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "notionId"     VARCHAR(255)             NOT NULL,
    "resourceType" VARCHAR(255)             NOT NULL,
    "workflowId"   VARCHAR(255)             NOT NULL,
    "connectorId"  BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"           BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_notion_to_check_notion_id_conn_id_wf_id" ON "notion_connector_resources_to_check_cache_entries" ("notionId", "connectorId", "workflowId")
CREATE INDEX "notion_connector_resources_to_check_cache_entries_connector_id" ON "notion_connector_resources_to_check_cache_entries" ("connectorId")
CREATE INDEX "notion_connector_resources_to_check_cache_entries_workflow_id" ON "notion_connector_resources_to_check_cache_entries" ("workflowId")

CREATE TABLE IF NOT EXISTS "google_drive_configs"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "pdfEnabled"        BOOLEAN                  NOT NULL DEFAULT false,
    "csvEnabled"        BOOLEAN                  NOT NULL DEFAULT false,
    "largeFilesEnabled" BOOLEAN                  NOT NULL DEFAULT false,
    "connectorId"       BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_configs_connector_id" ON "google_drive_configs" ("connectorId")

CREATE TABLE IF NOT EXISTS "intercom_workspaces"
(
    "createdAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "intercomWorkspaceId"        VARCHAR(255)             NOT NULL,
    "name"                       VARCHAR(255)             NOT NULL,
    "conversationsSlidingWindow" INTEGER                  NOT NULL DEFAULT 180,
    "syncAllConversations"       VARCHAR(255)             NOT NULL DEFAULT 'disabled',
    "shouldSyncNotes"            BOOLEAN                  NOT NULL DEFAULT true,
    "region"                     VARCHAR(255)             NOT NULL DEFAULT 'US',
    "connectorId"                BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                         BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intercom_connector_workspace_idx" ON "intercom_workspaces" ("connectorId", "intercomWorkspaceId")

CREATE TABLE IF NOT EXISTS "intercom_help_centers"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "intercomWorkspaceId" VARCHAR(255)             NOT NULL,
    "helpCenterId"        VARCHAR(255)             NOT NULL,
    "name"                VARCHAR(255)             NOT NULL,
    "identifier"          VARCHAR(255)             NOT NULL,
    "websiteTurnedOn"     BOOLEAN                  NOT NULL DEFAULT false,
    "lastUpsertedTs"      TIMESTAMP WITH TIME ZONE,
    "permission"          VARCHAR(255)             NOT NULL,
    "connectorId"         BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intercom_connector_help_center_idx" ON "intercom_help_centers" ("connectorId", "helpCenterId")
CREATE INDEX "intercom_help_centers_connector_id" ON "intercom_help_centers" ("connectorId")
CREATE INDEX "intercom_help_centers_help_center_id" ON "intercom_help_centers" ("helpCenterId")

CREATE TABLE IF NOT EXISTS "intercom_collections"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "intercomWorkspaceId" VARCHAR(255)             NOT NULL,
    "collectionId"        VARCHAR(255)             NOT NULL,
    "helpCenterId"        VARCHAR(255)             NOT NULL,
    "parentId"            VARCHAR(255),
    "name"                VARCHAR(255)             NOT NULL,
    "description"         TEXT,
    "url"                 VARCHAR(255)             NOT NULL,
    "lastUpsertedTs"      TIMESTAMP WITH TIME ZONE,
    "permission"          VARCHAR(255)             NOT NULL,
    "connectorId"         BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intercom_connector_collection_idx" ON "intercom_collections" ("connectorId", "collectionId")
CREATE INDEX "intercom_collections_connector_id" ON "intercom_collections" ("connectorId")
CREATE INDEX "intercom_collections_collection_id" ON "intercom_collections" ("collectionId")

CREATE TABLE IF NOT EXISTS "intercom_articles"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "intercomWorkspaceId" VARCHAR(255)             NOT NULL,
    "articleId"           VARCHAR(255)             NOT NULL,
    "title"               VARCHAR(255)             NOT NULL,
    "url"                 VARCHAR(255),
    "authorId"            VARCHAR(255)             NOT NULL,
    "parentId"            VARCHAR(255),
    "parentType"          VARCHAR(255),
    "parents"             VARCHAR(255)[]           NOT NULL,
    "state"               VARCHAR(255)             NOT NULL,
    "lastUpsertedTs"      TIMESTAMP WITH TIME ZONE,
    "permission"          VARCHAR(255)             NOT NULL,
    "connectorId"         BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intercom_connector_article_idx" ON "intercom_articles" ("connectorId", "articleId")
CREATE INDEX "intercom_articles_connector_id" ON "intercom_articles" ("connectorId")
CREATE INDEX "intercom_articles_article_id" ON "intercom_articles" ("articleId")

CREATE TABLE IF NOT EXISTS "intercom_teams"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "teamId"         VARCHAR(255)             NOT NULL,
    "name"           VARCHAR(255)             NOT NULL,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "permission"     VARCHAR(255)             NOT NULL,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intercom_connector_team_idx" ON "intercom_teams" ("connectorId", "teamId")

CREATE TABLE IF NOT EXISTS "intercom_conversations"
(
    "createdAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"        VARCHAR(255)             NOT NULL,
    "teamId"                VARCHAR(255),
    "conversationCreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastUpsertedTs"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId"           BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                    BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intercom_connector_conversation_idx" ON "intercom_conversations" ("connectorId", "conversationId")

CREATE TABLE IF NOT EXISTS "webcrawler_configurations"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "url"            VARCHAR(512)             NOT NULL,
    "maxPageToCrawl" INTEGER,
    "crawlMode"      VARCHAR(20)              NOT NULL DEFAULT true,
    "depth"          INTEGER                  NOT NULL,
    "crawlFrequency" VARCHAR(20)              NOT NULL DEFAULT 'monthly',
    "lastCrawledAt"  TIMESTAMP WITH TIME ZONE,
    "crawlId"        VARCHAR(64)                       DEFAULT NULL,
    "actions"        JSONB                             DEFAULT NULL,
    "sitemapOnly"    BOOLEAN                  NOT NULL DEFAULT false,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX "webcrawler_configurations_connector_id" ON "webcrawler_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "webcrawler_folders"
(
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "url"                       TEXT                     NOT NULL,
    "urlMd5"                    VARCHAR(32)              NOT NULL,
    "parentUrl"                 TEXT,
    "internalId"                VARCHAR(255)             NOT NULL,
    "lastSeenAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId"               BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                        BIGSERIAL,
    "webcrawlerConfigurationId" BIGINT REFERENCES "webcrawler_configurations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webcrawler_folders_url_md5_connector_id_webcrawler_configuratio" ON "webcrawler_folders" ("urlMd5", "connectorId", "webcrawlerConfigurationId")
CREATE UNIQUE INDEX "webcrawler_folders_connector_id_internal_id" ON "webcrawler_folders" ("connectorId", "internalId")

CREATE TABLE IF NOT EXISTS "webcrawler_pages"
(
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "url"                       TEXT                     NOT NULL,
    "urlMd5"                    VARCHAR(32)              NOT NULL,
    "title"                     TEXT,
    "parentUrl"                 TEXT,
    "documentId"                VARCHAR(255)             NOT NULL,
    "depth"                     INTEGER,
    "lastSeenAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId"               BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                        BIGSERIAL,
    "webcrawlerConfigurationId" BIGINT REFERENCES "webcrawler_configurations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webcrawler_pages_url_md5_connector_id_webcrawler_configuration_" ON "webcrawler_pages" ("urlMd5", "connectorId", "webcrawlerConfigurationId")
CREATE UNIQUE INDEX "webcrawler_pages_connector_id_document_id" ON "webcrawler_pages" ("connectorId", "documentId")

CREATE TABLE IF NOT EXISTS "webcrawler_configuration_headers"
(
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "key"                       VARCHAR(255)             NOT NULL,
    "value"                     VARCHAR(255)             NOT NULL,
    "connectorId"               BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                        BIGSERIAL,
    "webcrawlerConfigurationId" BIGINT REFERENCES "webcrawler_configurations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wch_webcrawlerConfigurationId_key" ON "webcrawler_configuration_headers" ("webcrawlerConfigurationId", "key")

CREATE TABLE IF NOT EXISTS "snowflake_configurations"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "snowflake_configurations_connector_id" ON "snowflake_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "bigquery_configurations"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "useMetadataForDBML" BOOLEAN                  NOT NULL DEFAULT false,
    "connectorId"        BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bigquery_configurations_connector_id" ON "bigquery_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "remote_databases"
(
    "internalId"     VARCHAR(255)             NOT NULL,
    "name"           VARCHAR(255)             NOT NULL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "lastUpsertedAt" TIMESTAMP WITH TIME ZONE,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remote_databases_connector_id_internal_id" ON "remote_databases" ("connectorId", "internalId")

CREATE TABLE IF NOT EXISTS "remote_schemas"
(
    "internalId"     VARCHAR(255)             NOT NULL,
    "name"           VARCHAR(255)             NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "databaseName"   VARCHAR(255)             NOT NULL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastUpsertedAt" TIMESTAMP WITH TIME ZONE,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remote_schemas_connector_id_internal_id" ON "remote_schemas" ("connectorId", "internalId")

CREATE TABLE IF NOT EXISTS "remote_tables"
(
    "internalId"     TEXT                     NOT NULL,
    "name"           TEXT                     NOT NULL,
    "schemaName"     TEXT                     NOT NULL,
    "databaseName"   TEXT                     NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastUpsertedAt" TIMESTAMP WITH TIME ZONE,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remote_tables_connector_id_internal_id" ON "remote_tables" ("connectorId", "internalId")

CREATE TABLE IF NOT EXISTS "zendesk_timestamp_cursors"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "timestampCursor" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId"     BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_timestamp_cursors_connector_id" ON "zendesk_timestamp_cursors" ("connectorId")

CREATE TABLE IF NOT EXISTS "zendesk_configurations"
(
    "createdAt"                      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                      TIMESTAMP WITH TIME ZONE NOT NULL,
    "subdomain"                      VARCHAR(255)             NOT NULL,
    "retentionPeriodDays"            INTEGER                  NOT NULL DEFAULT 180,
    "syncUnresolvedTickets"          BOOLEAN                  NOT NULL DEFAULT false,
    "hideCustomerDetails"            BOOLEAN                  NOT NULL DEFAULT false,
    "organizationTagsToInclude"      VARCHAR(255)[],
    "organizationTagsToExclude"      VARCHAR(255)[],
    "ticketTagsToInclude"            VARCHAR(255)[],
    "ticketTagsToExclude"            VARCHAR(255)[],
    "customFieldsConfig"             JSONB                    NOT NULL DEFAULT '[]',
    "rateLimitTransactionsPerSecond" INTEGER                           DEFAULT NULL,
    "connectorId"                    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_configurations_connector_id" ON "zendesk_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "zendesk_brands"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "brandId"              BIGINT                   NOT NULL,
    "name"                 VARCHAR(255)             NOT NULL,
    "url"                  TEXT                     NOT NULL,
    "subdomain"            VARCHAR(255)             NOT NULL,
    "helpCenterPermission" VARCHAR(255)             NOT NULL,
    "ticketsPermission"    VARCHAR(255)             NOT NULL,
    "lastUpsertedTs"       TIMESTAMP WITH TIME ZONE,
    "connectorId"          BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_brands_connector_brand_idx" ON "zendesk_brands" ("connectorId", "brandId")
CREATE INDEX "zendesk_brands_connector_id" ON "zendesk_brands" ("connectorId")

CREATE TABLE IF NOT EXISTS "zendesk_categories"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "categoryId"     BIGINT                   NOT NULL,
    "brandId"        BIGINT                   NOT NULL,
    "name"           TEXT                     NOT NULL,
    "description"    TEXT,
    "url"            TEXT                     NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_categories_connector_brand_category_idx" ON "zendesk_categories" ("connectorId", "brandId", "categoryId")
CREATE INDEX "zendesk_categories_connector_brand_idx" ON "zendesk_categories" ("connectorId", "brandId")
CREATE INDEX "zendesk_categories_connector_id" ON "zendesk_categories" ("connectorId")

CREATE TABLE IF NOT EXISTS "zendesk_articles"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "articleId"      BIGINT                   NOT NULL,
    "brandId"        BIGINT                   NOT NULL,
    "categoryId"     BIGINT                   NOT NULL,
    "name"           TEXT                     NOT NULL,
    "url"            TEXT                     NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "connectorId"    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_articles_connector_brand_article_idx" ON "zendesk_articles" ("connectorId", "brandId", "articleId")
CREATE INDEX "zendesk_articles_connector_brand_category_idx" ON "zendesk_articles" ("connectorId", "brandId", "categoryId")
CREATE INDEX "zendesk_articles_connector_brand_idx" ON "zendesk_articles" ("connectorId", "brandId")
CREATE INDEX "zendesk_articles_connector_id" ON "zendesk_articles" ("connectorId")

CREATE TABLE IF NOT EXISTS "zendesk_tickets"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "url"             TEXT                     NOT NULL,
    "subject"         TEXT                     NOT NULL,
    "ticketId"        BIGINT                   NOT NULL,
    "brandId"         BIGINT                   NOT NULL,
    "permission"      VARCHAR(255)             NOT NULL,
    "ticketUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastUpsertedTs"  TIMESTAMP WITH TIME ZONE,
    "connectorId"     BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_tickets_connector_brand_ticket_idx" ON "zendesk_tickets" ("connectorId", "brandId", "ticketId")
CREATE INDEX "zendesk_tickets_connector_brand_idx" ON "zendesk_tickets" ("connectorId", "brandId")
CREATE INDEX "zendesk_tickets_connector_id" ON "zendesk_tickets" ("connectorId")

CREATE TABLE IF NOT EXISTS "salesforce_configurations"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salesforce_configurations_connector_id" ON "salesforce_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "salesforce_synced_queries"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "rootNodeName"         TEXT                     NOT NULL,
    "soql"                 TEXT                     NOT NULL,
    "titleTemplate"        TEXT                     NOT NULL,
    "contentTemplate"      TEXT                     NOT NULL,
    "tagsTemplate"         TEXT,
    "lastSeenModifiedDate" TIMESTAMP WITH TIME ZONE,
    "connectorId"          BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX "salesforce_synced_queries_connector_id" ON "salesforce_synced_queries" ("connectorId")

CREATE TABLE IF NOT EXISTS "gong_configurations"
(
    "createdAt"                      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                      TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastSyncTimestamp"              BIGINT,
    "lastGarbageCollectionTimestamp" BIGINT,
    "baseUrl"                        VARCHAR(255)             NOT NULL,
    "retentionPeriodDays"            INTEGER,
    "trackersEnabled"                BOOLEAN                  NOT NULL DEFAULT false,
    "accountsEnabled"                BOOLEAN                  NOT NULL DEFAULT false,
    "permissionProfileId"            VARCHAR(255),
    "excludeTitleKeywords"           VARCHAR(255)[],
    "connectorId"                    BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gong_configurations_connector_id" ON "gong_configurations" ("connectorId")

CREATE TABLE IF NOT EXISTS "gong_transcripts"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "callDate"    BIGINT                   NOT NULL,
    "callId"      TEXT                     NOT NULL,
    "title"       TEXT                     NOT NULL,
    "url"         TEXT                     NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gong_transcripts_connector_id_call_id" ON "gong_transcripts" ("connectorId", "callId")

CREATE TABLE IF NOT EXISTS "gong_users"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "email"       VARCHAR(255)             NOT NULL,
    "firstName"   VARCHAR(255),
    "gongId"      VARCHAR(255),
    "lastName"    VARCHAR(255),
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gong_users_connector_id_gong_id" ON "gong_users" ("connectorId", "gongId")

CREATE TABLE IF NOT EXISTS "dust_project_configurations"
(
    "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectId"    VARCHAR(255)             NOT NULL UNIQUE,
    "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
    "connectorId"  BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"           BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dust_project_configurations_connector_id" ON "dust_project_configurations" ("connectorId")
CREATE UNIQUE INDEX "dust_project_configurations_project_id" ON "dust_project_configurations" ("projectId")

CREATE TABLE IF NOT EXISTS "dust_project_conversations"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"    VARCHAR(255)             NOT NULL UNIQUE,
    "projectId"         VARCHAR(255)             NOT NULL,
    "lastSyncedAt"      TIMESTAMP WITH TIME ZONE,
    "sourceUpdatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "documentPartCount" INTEGER,
    "connectorId"       BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dust_project_conversations_conversation_id" ON "dust_project_conversations" ("conversationId")
CREATE UNIQUE INDEX "dust_project_conversations_connector_id_conversation_id" ON "dust_project_conversations" ("connectorId", "conversationId")
CREATE INDEX "dust_project_conversations_connector_id_source_updated_at" ON "dust_project_conversations" ("connectorId", "sourceUpdatedAt")
CREATE INDEX "dust_project_conversations_connector_id_project_id_conversation" ON "dust_project_conversations" ("connectorId", "projectId", "conversationId")

CREATE TABLE IF NOT EXISTS "dust_project_mount_files"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectId"       VARCHAR(255)             NOT NULL,
    "scopedPath"      VARCHAR(255)             NOT NULL,
    "documentId"      VARCHAR(255)             NOT NULL,
    "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId"     BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dust_project_mount_files_connector_id_scoped_path" ON "dust_project_mount_files" ("connectorId", "scopedPath")
CREATE INDEX "dust_project_mount_files_connector_id_source_updated_at" ON "dust_project_mount_files" ("connectorId", "sourceUpdatedAt")
CREATE INDEX "dust_project_mount_files_connector_project_scoped" ON "dust_project_mount_files" ("connectorId", "projectId", "scopedPath")
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION notion_pages_trigger() RETURNS trigger AS
$$
begin
    if TG_OP = 'INSERT' OR new.title IS DISTINCT FROM old.title then
        new."titleSearchVector" := to_tsvector('english', unaccent(coalesce(new.title, '')));
    end if;
    return new;
end
$$ LANGUAGE plpgsql;


DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notion_pages_vector_update') THEN
            CREATE TRIGGER notion_pages_vector_update
                BEFORE INSERT OR UPDATE
                ON "notion_pages"
                FOR EACH ROW
            EXECUTE FUNCTION notion_pages_trigger();
        END IF;
    END
$$;


CREATE OR REPLACE FUNCTION notion_databases_trigger() RETURNS trigger AS
$$
begin
    if TG_OP = 'INSERT' OR new.title IS DISTINCT FROM old.title then
        new."titleSearchVector" := to_tsvector('english', unaccent(coalesce(new.title, '')));
    end if;
    return new;
end
$$ LANGUAGE plpgsql;


DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notion_databases_vector_update') THEN
            CREATE TRIGGER notion_databases_vector_update
                BEFORE INSERT OR UPDATE
                ON "notion_databases"
                FOR EACH ROW
            EXECUTE FUNCTION notion_databases_trigger();
        END IF;
    END
$$;
    
