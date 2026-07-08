CREATE TABLE IF NOT EXISTS "users"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastLoginAt"     TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "sId"             VARCHAR(255)             NOT NULL,
    "provider"        VARCHAR(255),
    "providerId"      VARCHAR(255),
    "workOSUserId"    VARCHAR(255),
    "username"        VARCHAR(255)             NOT NULL,
    "email"           VARCHAR(255)             NOT NULL,
    "name"            VARCHAR(255)             NOT NULL,
    "firstName"       VARCHAR(255)             NOT NULL,
    "lastName"        VARCHAR(255),
    "imageUrl"        VARCHAR(2048),
    "isDustSuperUser" BOOLEAN                  NOT NULL DEFAULT false,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "users_username" ON "users" ("username");
CREATE INDEX IF NOT EXISTS "users_provider_provider_id" ON "users" ("provider", "providerId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_s_id" ON "users" ("sId");
CREATE INDEX IF NOT EXISTS "users_email" ON "users" ("email");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "users_work_o_s_user_id" ON "users" ("workOSUserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_id" ON "users" ("id") WHERE "lastLoginAt" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "workspaces"
(
    "createdAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                        VARCHAR(255)             NOT NULL,
    "name"                       VARCHAR(255)             NOT NULL,
    "description"                VARCHAR(255),
    "segmentation"               VARCHAR(255),
    "ssoEnforced"                BOOLEAN                           DEFAULT false,
    "regionalModelsOnly"         BOOLEAN                  NOT NULL DEFAULT false,
    "workOSOrganizationId"       VARCHAR(255),
    "conversationsRetentionDays" INTEGER,
    "metronomeCustomerId"        VARCHAR(255)                      DEFAULT NULL,
    "whiteListedProviders"       VARCHAR(255)[]                    DEFAULT NULL,
    "defaultEmbeddingProvider"   VARCHAR(255)                      DEFAULT NULL,
    "metadata"                   JSONB                             DEFAULT NULL,
    "sharingPolicy"              VARCHAR(255)             NOT NULL DEFAULT 'all_scopes',
    "poolCreditState"            VARCHAR(255)             NOT NULL DEFAULT 'active',
    "programmaticCreditState"    VARCHAR(255)             NOT NULL DEFAULT 'active',
    "id"                         BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_s_id" ON "workspaces" ("sId");
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_work_o_s_organization_id" ON "workspaces" ("workOSOrganizationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workspaces_name" ON "workspaces" ("name");

CREATE TABLE IF NOT EXISTS "user_metadata"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "key"         VARCHAR(255)             NOT NULL,
    "value"       TEXT                     NOT NULL,
    "id"          BIGSERIAL,
    "userId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_metadata_user_id_key" ON "user_metadata" ("userId", "key") WHERE "workspaceId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "user_metadata_user_id_workspace_id_key" ON "user_metadata" ("userId", "workspaceId", "key") WHERE "workspaceId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "workspace_has_domains"
(
    "createdAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "domainAutoJoinEnabled" BOOLEAN DEFAULT false,
    "domain"                VARCHAR(255)             NOT NULL,
    "workspaceId"           BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                    BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_has_domains_domain" ON "workspace_has_domains" ("domain");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workspace_has_domains_workspace_id" ON "workspace_has_domains" ("workspaceId");

CREATE TABLE IF NOT EXISTS "memberships"
(
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "role"                      VARCHAR(255)             NOT NULL,
    "origin"                    VARCHAR(255)             NOT NULL DEFAULT 'invited',
    "startAt"                   TIMESTAMP WITH TIME ZONE NOT NULL,
    "endAt"                     TIMESTAMP WITH TIME ZONE,
    "firstUsedAt"               TIMESTAMP WITH TIME ZONE,
    "seatType"                  VARCHAR(255)             NOT NULL DEFAULT 'workspace',
    "creditState"               VARCHAR(255)             NOT NULL DEFAULT 'on_pool',
    "poolCapOverrideAwuCredits" INTEGER                           DEFAULT NULL,
    "workspaceId"               BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                        BIGSERIAL,
    "userId"                    BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "memberships_user_id_role" ON "memberships" ("userId", "role");
CREATE INDEX IF NOT EXISTS "memberships_start_at" ON "memberships" ("startAt");
CREATE INDEX IF NOT EXISTS "memberships_end_at" ON "memberships" ("endAt");
CREATE INDEX IF NOT EXISTS "memberships_workspace_id_user_id_start_at_end_at" ON "memberships" ("workspaceId", "userId", "startAt", "endAt");
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_id_workspace_id" ON "memberships" ("userId", "workspaceId") WHERE "endAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "memberships_workspace_id_first_used_at" ON "memberships" ("workspaceId", "firstUsedAt") WHERE "firstUsedAt" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "membership_upgrade_requests"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "status"           VARCHAR(16)              NOT NULL DEFAULT 'pending',
    "resolvedAt"       TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "workspaceId"      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    "userId"           BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "resolvedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "membership_upgrade_requests_workspace_status_idx" ON "membership_upgrade_requests" ("workspaceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "membership_upgrade_requests_workspace_user_pending_idx" ON "membership_upgrade_requests" ("workspaceId", "userId") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "membership_upgrade_requests_user_idx" ON "membership_upgrade_requests" ("userId");
CREATE INDEX IF NOT EXISTS "membership_upgrade_requests_resolved_by_user_idx" ON "membership_upgrade_requests" ("resolvedByUserId");

CREATE TABLE IF NOT EXISTS "membership_invitations"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"            VARCHAR(255)             NOT NULL,
    "inviteEmail"    VARCHAR(255)             NOT NULL,
    "status"         VARCHAR(255)             NOT NULL DEFAULT 'pending',
    "initialRole"    VARCHAR(255)             NOT NULL DEFAULT 'user',
    "reminderSentAt" TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "seatType"       VARCHAR(255)                      DEFAULT NULL,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "invitedUserId"  BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "membership_invitations_workspace_id_status" ON "membership_invitations" ("workspaceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "membership_invitations_s_id" ON "membership_invitations" ("sId");
CREATE INDEX IF NOT EXISTS "membership_invitations_invite_email_status" ON "membership_invitations" ("inviteEmail", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "membership_invitations_created_at_id" ON "membership_invitations" ("createdAt", "id") WHERE "status" = 'pending' AND "reminderSentAt" IS NULL;

CREATE TABLE IF NOT EXISTS "groups"
(
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"          VARCHAR(255)             NOT NULL,
    "kind"          VARCHAR(255)             NOT NULL,
    "workOSGroupId" VARCHAR(255),
    "workspaceId"   BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "groups_workspace_id_name" ON "groups" ("workspaceId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "groups_workspace_id_work_o_s_group_id" ON "groups" ("workspaceId", "workOSGroupId");
CREATE INDEX IF NOT EXISTS "groups_workspace_id_kind" ON "groups" ("workspaceId", "kind");

CREATE TABLE IF NOT EXISTS "group_memberships"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "startAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "endAt"       TIMESTAMP WITH TIME ZONE,
    "status"      VARCHAR(255)             NOT NULL DEFAULT 'active',
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "userId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "groupId"     BIGINT                   NOT NULL REFERENCES "groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "group_memberships_user_id_group_id" ON "group_memberships" ("userId", "groupId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_memberships_workspace_id" ON "group_memberships" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_memberships_workspace_id_group_id_status_start_at" ON "group_memberships" ("workspaceId", "groupId", "status", "startAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_memberships_user_id_workspace_id_status_start_at" ON "group_memberships" ("userId", "workspaceId", "status", "startAt");

CREATE TABLE IF NOT EXISTS "tags"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "kind"        VARCHAR(255) DEFAULT 'standard',
    "name"        VARCHAR(255)             NOT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_workspace_id_name" ON "tags" ("workspaceId", "name");

CREATE TABLE IF NOT EXISTS "vaults"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt"      TIMESTAMP WITH TIME ZONE,
    "name"           VARCHAR(255)             NOT NULL,
    "kind"           VARCHAR(255)             NOT NULL,
    "managementMode" VARCHAR(255)             NOT NULL DEFAULT 'manual',
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vaults_workspace_id_name_deleted_at" ON "vaults" ("workspaceId", "name", "deletedAt");
CREATE INDEX IF NOT EXISTS "vaults_workspace_id_kind" ON "vaults" ("workspaceId", "kind");

CREATE TABLE IF NOT EXISTS "project_metadata"
(
    "createdAt"                   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                   TIMESTAMP WITH TIME ZONE NOT NULL,
    "description"                 TEXT,
    "archivedAt"                  TIMESTAMP WITH TIME ZONE,
    "lastTodoAnalysisAt"          TIMESTAMP WITH TIME ZONE,
    "todoGenerationEnabled"       BOOLEAN                  NOT NULL DEFAULT false,
    "initialTodoAnalysisLookback" VARCHAR(255),
    "pinnedFramePath"             VARCHAR(255),
    "defaultAgentSId"             VARCHAR(255)                      DEFAULT NULL,
    "workspaceId"                 BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                          BIGSERIAL,
    "spaceId"                     BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "project_metadata_space_id" ON "project_metadata" ("spaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_metadata_workspace_id" ON "project_metadata" ("workspaceId");

CREATE TABLE IF NOT EXISTS "apps"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt"          TIMESTAMP WITH TIME ZONE,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                VARCHAR(255)             NOT NULL,
    "name"               VARCHAR(255)             NOT NULL,
    "description"        VARCHAR(255),
    "visibility"         VARCHAR(255)             NOT NULL,
    "savedSpecification" TEXT,
    "savedConfig"        TEXT,
    "savedRun"           TEXT,
    "dustAPIProjectId"   VARCHAR(255)             NOT NULL,
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    "vaultId"            BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "apps_s_id" ON "apps" ("sId");
CREATE INDEX IF NOT EXISTS "apps_workspace_id_visibility" ON "apps" ("workspaceId", "visibility");
CREATE INDEX IF NOT EXISTS "apps_workspace_id_s_id_visibility" ON "apps" ("workspaceId", "sId", "visibility");
CREATE INDEX IF NOT EXISTS "apps_workspace_id_s_id" ON "apps" ("workspaceId", "sId");
CREATE INDEX IF NOT EXISTS "apps_workspace_id_vault_id" ON "apps" ("workspaceId", "vaultId");

CREATE TABLE IF NOT EXISTS "datasets"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"        VARCHAR(255)             NOT NULL,
    "description" VARCHAR(255),
    "schema"      JSONB,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "appId"       BIGINT                   NOT NULL REFERENCES "apps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "datasets_workspace_id_app_id_name" ON "datasets" ("workspaceId", "appId", "name");

CREATE TABLE IF NOT EXISTS "providers"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "providerId"  VARCHAR(255)             NOT NULL,
    "config"      TEXT                     NOT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "providers_workspace_id" ON "providers" ("workspaceId");

CREATE TABLE IF NOT EXISTS "clones"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "fromId"      BIGINT                   NOT NULL REFERENCES "apps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "toId"        BIGINT                   NOT NULL REFERENCES "apps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "clones_workspace_id" ON "clones" ("workspaceId");

CREATE TABLE IF NOT EXISTS "keys"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastUsedAt"         TIMESTAMP WITH TIME ZONE,
    "secret"             VARCHAR(255)             NOT NULL,
    "status"             VARCHAR(255)             NOT NULL,
    "name"               VARCHAR(255)             NOT NULL,
    "isSystem"           BOOLEAN                  NOT NULL DEFAULT false,
    "role"               VARCHAR(255)             NOT NULL DEFAULT 'builder',
    "monthlyCapMicroUsd" BIGINT,
    "groupIds"           BIGINT[]                 NOT NULL,
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    "userId"             BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "keys_secret" ON "keys" ("secret");
CREATE INDEX IF NOT EXISTS "keys_user_id" ON "keys" ("userId");
CREATE INDEX IF NOT EXISTS "keys_workspace_id" ON "keys" ("workspaceId");
CREATE INDEX IF NOT EXISTS "keys_group_ids" ON "keys" ("groupIds");

CREATE TABLE IF NOT EXISTS "files"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "contentType"     VARCHAR(255)             NOT NULL,
    "fileName"        VARCHAR(4096)            NOT NULL,
    "fileSize"        INTEGER                  NOT NULL,
    "status"          VARCHAR(255)             NOT NULL,
    "useCase"         VARCHAR(255)             NOT NULL,
    "version"         INTEGER                  NOT NULL DEFAULT 0,
    "useCaseMetadata" JSONB                             DEFAULT NULL,
    "snippet"         TEXT                              DEFAULT NULL,
    "mountFilePath"   VARCHAR(4096)                     DEFAULT NULL,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    "userId"          BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "files_workspace_id_id" ON "files" ("workspaceId", "id");
CREATE INDEX IF NOT EXISTS "files_workspace_id_user_id" ON "files" ("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "files_workspace_id_use_case_status_" ON "files" ("workspaceId", "useCase", "status",
                                                                             ("useCaseMetadata" #>> '{spaceId}'));
CREATE UNIQUE INDEX IF NOT EXISTS "files_workspace_id_mount_file_path" ON "files" ("workspaceId", "mountFilePath") WHERE "mountFilePath" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "shareable_files"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "token"       UUID                     NOT NULL,
    "shareScope"  VARCHAR(255)             NOT NULL,
    "sharedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "expiresAt"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "fileId"      BIGINT                   NOT NULL REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sharedBy"    BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shareable_files_workspace_id_file_id" ON "shareable_files" ("workspaceId", "fileId");
CREATE INDEX IF NOT EXISTS "shareable_files_workspace_id_share_scope" ON "shareable_files" ("workspaceId", "shareScope");
CREATE UNIQUE INDEX IF NOT EXISTS "shareable_files_token" ON "shareable_files" ("token");

CREATE TABLE IF NOT EXISTS "authorized_file_accesses"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "kind"             VARCHAR(255)             NOT NULL,
    "ref"              VARCHAR(4096)            NOT NULL,
    "fileName"         VARCHAR(255)  DEFAULT NULL,
    "legacyPath"       VARCHAR(4096) DEFAULT NULL,
    "shareScope"       VARCHAR(255)             NOT NULL,
    "frameContentHash" VARCHAR(255)             NOT NULL,
    "allowedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId"      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    "shareableFileId"  BIGINT                   NOT NULL REFERENCES "shareable_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "computedByUserId" VARCHAR(255)             NOT NULL,
    "revokedAt"        TIMESTAMP,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "authorized_file_accesses_workspace_id" ON "authorized_file_accesses" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "authorized_file_accesses_shareable_file_id" ON "authorized_file_accesses" ("shareableFileId");

CREATE TABLE IF NOT EXISTS "sharing_grants"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "email"           VARCHAR(255)             NOT NULL,
    "grantedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "expiresAt"       TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "revokedAt"       TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "lastViewedAt"    TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    "shareableFileId" BIGINT                   NOT NULL REFERENCES "shareable_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "grantedBy"       BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sharing_grants_workspace_id_shareable_file_id" ON "sharing_grants" ("workspaceId", "shareableFileId") WHERE "revokedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "sharing_grants_workspace_id_email" ON "sharing_grants" ("workspaceId", "email") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sharing_grants_workspace_id_shareable_file_id_email" ON "sharing_grants" ("workspaceId", "shareableFileId", "email") WHERE "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "external_viewer_sessions"
(
    "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "sessionToken" UUID                     NOT NULL,
    "email"        VARCHAR(255)             NOT NULL,
    "expiresAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId"  BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"           BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_viewer_sessions_session_token" ON "external_viewer_sessions" ("sessionToken");
CREATE INDEX IF NOT EXISTS "external_viewer_sessions_workspace_id_email" ON "external_viewer_sessions" ("workspaceId", "email");

CREATE TABLE IF NOT EXISTS "dust_app_secrets"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"        VARCHAR(255)             NOT NULL,
    "hash"        TEXT                     NOT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "userId"      BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dust_app_secrets_workspace_id" ON "dust_app_secrets" ("workspaceId");

CREATE TABLE IF NOT EXISTS "group_vaults"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "kind"        VARCHAR(255)             NOT NULL DEFAULT 'member',
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "vaultId"     BIGINT REFERENCES "vaults" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "groupId"     BIGINT REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("vaultId", "groupId"),
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_vaults_vault_id_group_id" ON "group_vaults" ("vaultId", "groupId");
CREATE INDEX IF NOT EXISTS "group_vaults_group_id" ON "group_vaults" ("groupId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_vaults_workspace_id_group_id" ON "group_vaults" ("workspaceId", "groupId");

CREATE TABLE IF NOT EXISTS "webhook_sources"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"               VARCHAR(255)             NOT NULL,
    "secret"             TEXT,
    "urlSecret"          TEXT                     NOT NULL,
    "signatureHeader"    VARCHAR(255),
    "signatureAlgorithm" VARCHAR(255),
    "provider"           VARCHAR(255),
    "subscribedEvents"   VARCHAR(255)[]           NOT NULL,
    "remoteMetadata"     JSONB,
    "oauthConnectionId"  TEXT,
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_sources_workspace_id_name" ON "webhook_sources" ("workspaceId", "name");

CREATE TABLE IF NOT EXISTS "webhook_sources_views"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt"       TIMESTAMP WITH TIME ZONE,
    "editedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "customName"      VARCHAR(255),
    "description"     TEXT                     NOT NULL,
    "icon"            VARCHAR(255)             NOT NULL,
    "webhookSourceId" BIGINT                   NOT NULL REFERENCES "webhook_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    "vaultId"         BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editedByUserId"  BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_sources_views_workspace_id_vault_id" ON "webhook_sources_views" ("workspaceId", "vaultId");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_sources_views_workspace_webhook_source_vault_active" ON "webhook_sources_views" ("workspaceId", "vaultId", "webhookSourceId") WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "triggers"
(
    "createdAt"                    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                    TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId"         VARCHAR(255)             NOT NULL,
    "name"                         VARCHAR(255)             NOT NULL,
    "kind"                         VARCHAR(255)             NOT NULL,
    "naturalLanguageDescription"   TEXT    DEFAULT NULL,
    "customPrompt"                 TEXT    DEFAULT NULL,
    "status"                       VARCHAR(255)             NOT NULL,
    "configuration"                JSONB                    NOT NULL,
    "origin"                       VARCHAR(255)             NOT NULL,
    "webhookSourceViewId"          BIGINT REFERENCES "webhook_sources_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "executionPerDayLimitOverride" INTEGER DEFAULT NULL,
    "executionMode"                VARCHAR(255),
    "workspaceId"                  BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                           BIGSERIAL,
    "editor"                       BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "triggers_workspace_id_agent_configuration_id_name" ON "triggers" ("workspaceId", "agentConfigurationId", "name");
CREATE INDEX IF NOT EXISTS "triggers_workspace_id_webhook_source_view_id" ON "triggers" ("workspaceId", "webhookSourceViewId");

CREATE TABLE IF NOT EXISTS "webhook_requests"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "status"          VARCHAR(255)             NOT NULL DEFAULT 'received',
    "webhookSourceId" BIGINT                   NOT NULL REFERENCES "webhook_sources" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "processedAt"     TIMESTAMP WITH TIME ZONE,
    "errorMessage"    TEXT,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_requests_workspace_id_webhook_source_id_status" ON "webhook_requests" ("workspaceId", "webhookSourceId", "status");
CREATE INDEX IF NOT EXISTS "webhook_requests_workspace_id_webhook_source_id_created_at" ON "webhook_requests" ("workspaceId", "webhookSourceId", "createdAt");

CREATE TABLE IF NOT EXISTS "webhook_request_triggers"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "status"           VARCHAR(255)             NOT NULL DEFAULT 'not_matched',
    "errorMessage"     TEXT                              DEFAULT NULL,
    "webhookRequestId" BIGINT                   NOT NULL REFERENCES "webhook_requests" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "triggerId"        BIGINT                   NOT NULL REFERENCES "triggers" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "workspaceId"      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_request_triggers_workspace_id_webhook_request_id_status" ON "webhook_request_triggers" ("workspaceId", "webhookRequestId", "status");
CREATE INDEX IF NOT EXISTS "webhook_request_triggers_workspace_id_trigger_id_status" ON "webhook_request_triggers" ("workspaceId", "triggerId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_request_triggers_webhook_request_id_trigger_id" ON "webhook_request_triggers" ("webhookRequestId", "triggerId");

CREATE TABLE IF NOT EXISTS "conversations"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                VARCHAR(255)             NOT NULL,
    "title"              TEXT,
    "visibility"         VARCHAR(255)             NOT NULL DEFAULT 'unlisted',
    "depth"              INTEGER                  NOT NULL DEFAULT 0,
    "isRunningAgentLoop" BOOLEAN                  NOT NULL DEFAULT false,
    "requestedSpaceIds"  BIGINT[]                 NOT NULL DEFAULT ARRAY []::BIGINT[],
    "hasError"           BOOLEAN                  NOT NULL DEFAULT false,
    "metadata"           JSONB                    NOT NULL DEFAULT '{}',
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    "triggerId"          BIGINT REFERENCES "triggers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "spaceId"            BIGINT REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_workspace_id_s_id" ON "conversations" ("workspaceId", "sId");
CREATE INDEX IF NOT EXISTS "conversations_workspace_id_trigger_id" ON "conversations" ("workspaceId", "triggerId");
CREATE INDEX IF NOT EXISTS "conversations_workspace_id_space_id" ON "conversations" ("workspaceId", "spaceId");
CREATE INDEX IF NOT EXISTS "conversations_workspace_id_created_at_idx" ON "conversations" ("workspaceId", "createdAt");

CREATE TABLE IF NOT EXISTS "conversation_participants"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "action"         VARCHAR(255)             NOT NULL,
    "actionRequired" BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "conversationId" BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"         BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_workspace_id_user_id_conversation_id" ON "conversation_participants" ("workspaceId", "userId", "conversationId");
CREATE INDEX IF NOT EXISTS "conversation_participants_workspace_id_user_id_action" ON "conversation_participants" ("workspaceId", "userId", "action");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_participants_conversation_id" ON "conversation_participants" ("conversationId");

CREATE TABLE IF NOT EXISTS "user_conversation_reads"
(
    "lastReadAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId" BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"         BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_conversation_reads_workspace_id_user_id_conversation_id" ON "user_conversation_reads" ("workspaceId", "userId", "conversationId");
CREATE INDEX IF NOT EXISTS "user_conversation_reads_workspace_id_user_id" ON "user_conversation_reads" ("workspaceId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_conversation_reads_conversation_id" ON "user_conversation_reads" ("conversationId");

CREATE TABLE IF NOT EXISTS "wake_ups"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"       BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"               BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentConfigurationId" VARCHAR(255)             NOT NULL,
    "scheduleType"         VARCHAR(255)             NOT NULL,
    "fireAt"               TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "cronExpression"       TEXT                              DEFAULT NULL,
    "cronTimezone"         TEXT                              DEFAULT NULL,
    "reason"               TEXT                     NOT NULL,
    "status"               VARCHAR(255)             NOT NULL DEFAULT 'scheduled',
    "fireCount"            INTEGER                  NOT NULL DEFAULT 0,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "wake_ups_conversation_id" ON "wake_ups" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "wake_ups_workspace_id_user_id_idx" ON "wake_ups" ("workspaceId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "wake_ups_workspace_id_status_idx" ON "wake_ups" ("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "data_sources"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt"                TIMESTAMP WITH TIME ZONE,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "editedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"                     VARCHAR(255)             NOT NULL,
    "description"              TEXT,
    "assistantDefaultSelected" BOOLEAN                  NOT NULL DEFAULT true,
    "dustAPIProjectId"         VARCHAR(255)             NOT NULL,
    "dustAPIDataSourceId"      VARCHAR(255)             NOT NULL,
    "connectorId"              VARCHAR(255),
    "connectorProvider"        VARCHAR(255),
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "conversationId"           BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editedByUserId"           BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "vaultId"                  BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "data_sources_workspace_id_name_deleted_at" ON "data_sources" ("workspaceId", "name", "deletedAt");
CREATE INDEX IF NOT EXISTS "data_sources_workspace_id_connector_provider" ON "data_sources" ("workspaceId", "connectorProvider");
CREATE INDEX IF NOT EXISTS "data_sources_workspace_id_vault_id" ON "data_sources" ("workspaceId", "vaultId");
CREATE UNIQUE INDEX IF NOT EXISTS "data_sources_workspace_id_conversation_id" ON "data_sources" ("workspaceId", "conversationId");
CREATE INDEX IF NOT EXISTS "data_sources_dust_a_p_i_project_id" ON "data_sources" ("dustAPIProjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "data_sources_conversation_id" ON "data_sources" ("conversationId");

CREATE TABLE IF NOT EXISTS "data_source_views"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt"      TIMESTAMP WITH TIME ZONE,
    "editedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "kind"           VARCHAR(255)             NOT NULL DEFAULT 'default',
    "parentsIn"      VARCHAR(255)[],
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "vaultId"        BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceId"   BIGINT                   NOT NULL REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "data_source_views_workspace_id_id" ON "data_source_views" ("workspaceId", "id");
CREATE INDEX IF NOT EXISTS "data_source_views_workspace_id_vault_id" ON "data_source_views" ("workspaceId", "vaultId");
CREATE UNIQUE INDEX IF NOT EXISTS "data_source_view_workspace_data_source_vault_deleted_at_unique" ON "data_source_views" ("workspaceId", "dataSourceId", "vaultId", "deletedAt");

CREATE TABLE IF NOT EXISTS "runs"
(
    "createdAt"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"               TIMESTAMP WITH TIME ZONE NOT NULL,
    "dustRunId"               VARCHAR(255)             NOT NULL,
    "runType"                 VARCHAR(255)             NOT NULL,
    "useWorkspaceCredentials" BOOLEAN,
    "workspaceId"             BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                      BIGSERIAL,
    "appId"                   BIGINT REFERENCES "apps" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "runs_workspace_id_app_id_run_type_created_at" ON "runs" ("workspaceId", "appId", "runType", "createdAt");
CREATE INDEX IF NOT EXISTS "runs_workspace_id_created_at" ON "runs" ("workspaceId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "runs_dust_run_id" ON "runs" ("dustRunId");

CREATE TABLE IF NOT EXISTS "run_usages"
(
    "providerId"          VARCHAR(255)             NOT NULL,
    "modelId"             VARCHAR(255)             NOT NULL,
    "promptTokens"        INTEGER                  NOT NULL,
    "completionTokens"    INTEGER                  NOT NULL,
    "cachedTokens"        INTEGER                           DEFAULT NULL,
    "cacheCreationTokens" INTEGER                           DEFAULT NULL,
    "costMicroUsd"        BIGINT                   NOT NULL DEFAULT 0,
    "isBatch"             BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "runId"               BIGINT                   NOT NULL REFERENCES "runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "run_usages_run_id" ON "run_usages" ("runId");
CREATE INDEX IF NOT EXISTS "run_usages_provider_id_model_id" ON "run_usages" ("providerId", "modelId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "run_usages_workspace_id" ON "run_usages" ("workspaceId");

CREATE TABLE IF NOT EXISTS "extension_configurations"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "blacklistedDomains" VARCHAR(255)[]           NOT NULL DEFAULT ARRAY []::VARCHAR(255)[],
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "extension_configurations_workspace_id" ON "extension_configurations" ("workspaceId");

DO 'BEGIN CREATE TYPE "public"."enum_plans_maxMessagesTimeframe" AS ENUM (''day'', ''lifetime''); EXCEPTION WHEN duplicate_object THEN null; END';

CREATE TABLE IF NOT EXISTS "plans"
(
    "createdAt"                       TIMESTAMP WITH TIME ZONE                   NOT NULL,
    "updatedAt"                       TIMESTAMP WITH TIME ZONE                   NOT NULL,
    "code"                            VARCHAR(255)                               NOT NULL,
    "name"                            VARCHAR(255)                               NOT NULL,
    "trialPeriodDays"                 INTEGER                                    NOT NULL DEFAULT 0,
    "canUseProduct"                   BOOLEAN                                    NOT NULL DEFAULT true,
    "maxMessages"                     INTEGER                                    NOT NULL,
    "maxMessagesTimeframe"            "public"."enum_plans_maxMessagesTimeframe" NOT NULL,
    "maxAwuCredits"                   INTEGER                                    NOT NULL DEFAULT -1,
    "maxAwuCreditsTimeframe"          VARCHAR(255)                               NOT NULL DEFAULT 'lifetime',
    "isDeepDiveAllowed"               BOOLEAN                                    NOT NULL DEFAULT true,
    "maxImagesPerWeek"                INTEGER                                    NOT NULL DEFAULT 0,
    "maxUsersInWorkspace"             INTEGER                                    NOT NULL,
    "maxFreeUsersInWorkspace"         INTEGER                                    NOT NULL DEFAULT -1,
    "maxLifetimeFreeUsersInWorkspace" INTEGER                                    NOT NULL DEFAULT -1,
    "maxVaultsInWorkspace"            INTEGER                                    NOT NULL,
    "isSlackbotAllowed"               BOOLEAN                                             DEFAULT false,
    "isManagedConfluenceAllowed"      BOOLEAN                                             DEFAULT false,
    "isManagedSlackAllowed"           BOOLEAN                                             DEFAULT false,
    "isManagedNotionAllowed"          BOOLEAN                                             DEFAULT false,
    "isManagedGoogleDriveAllowed"     BOOLEAN                                             DEFAULT false,
    "isManagedGithubAllowed"          BOOLEAN                                             DEFAULT false,
    "isManagedIntercomAllowed"        BOOLEAN                                             DEFAULT false,
    "isManagedWebCrawlerAllowed"      BOOLEAN                                             DEFAULT false,
    "isManagedSalesforceAllowed"      BOOLEAN                                             DEFAULT false,
    "isSSOAllowed"                    BOOLEAN                                             DEFAULT false,
    "isSCIMAllowed"                   BOOLEAN                                             DEFAULT false,
    "isAuditLogsAllowed"              BOOLEAN                                             DEFAULT false,
    "isBrandedFramesAllowed"          BOOLEAN                                             DEFAULT false,
    "isByok"                          BOOLEAN                                             DEFAULT false,
    "maxDataSourcesCount"             INTEGER                                    NOT NULL DEFAULT -1,
    "maxDataSourcesDocumentsCount"    INTEGER                                    NOT NULL DEFAULT -1,
    "maxDataSourcesDocumentsSizeMb"   INTEGER                                    NOT NULL DEFAULT 2,
    "id"                              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_code" ON "plans" ("code");

CREATE TABLE IF NOT EXISTS "subscriptions"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                  VARCHAR(255)             NOT NULL,
    "status"               VARCHAR(255)             NOT NULL,
    "trialing"             BOOLEAN      DEFAULT false,
    "paymentFailingSince"  TIMESTAMP WITH TIME ZONE,
    "startDate"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "endDate"              TIMESTAMP WITH TIME ZONE,
    "stripeSubscriptionId" VARCHAR(255),
    "metronomeContractId"  VARCHAR(255) DEFAULT NULL,
    "requestCancelAt"      TIMESTAMP WITH TIME ZONE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "planId"               BIGINT                   NOT NULL REFERENCES "plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_s_id" ON "subscriptions" ("sId");
CREATE INDEX IF NOT EXISTS "subscriptions_workspace_id_status" ON "subscriptions" ("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_workspace_id_status_plan_id" ON "subscriptions" ("workspaceId", "status", "planId");

CREATE TABLE IF NOT EXISTS "provider_credentials"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "providerId"     VARCHAR(255)             NOT NULL,
    "credentialId"   VARCHAR(255)             NOT NULL,
    "placeholder"    VARCHAR(255)             NOT NULL,
    "isHealthy"      BOOLEAN                  NOT NULL,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "editedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provider_credentials_workspace_id_provider_id" ON "provider_credentials" ("workspaceId", "providerId");

CREATE TABLE IF NOT EXISTS "templates"
(
    "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "userFacingDescription"  TEXT,
    "agentFacingDescription" TEXT,
    "backgroundColor"        VARCHAR(255)             NOT NULL,
    "emoji"                  VARCHAR(255)             NOT NULL,
    "visibility"             VARCHAR(255)             NOT NULL,
    "handle"                 VARCHAR(255)             NOT NULL,
    "presetDescription"      TEXT,
    "presetInstructions"     TEXT,
    "presetTemperature"      VARCHAR(255)             NOT NULL,
    "presetProviderId"       VARCHAR(255)             NOT NULL,
    "presetModelId"          VARCHAR(255)             NOT NULL,
    "presetActions"          JSONB                    NOT NULL DEFAULT '[]',
    "timeFrameDuration"      INTEGER,
    "timeFrameUnit"          VARCHAR(255),
    "helpInstructions"       TEXT,
    "helpActions"            TEXT,
    "sidekickInstructions"   TEXT,
    "tags"                   VARCHAR(255)[]           NOT NULL,
    "id"                     BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "templates_visibility" ON "templates" ("visibility");

CREATE TABLE IF NOT EXISTS "credits"
(
    "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "type"                   VARCHAR(16)              NOT NULL,
    "startDate"              TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "expirationDate"         TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "initialAmountMicroUsd"  BIGINT                   NOT NULL,
    "consumedAmountMicroUsd" BIGINT                   NOT NULL,
    "discount"               INTEGER                  DEFAULT NULL,
    "invoiceOrLineItemId"    VARCHAR(255)             DEFAULT NULL,
    "metronomeCreditId"      VARCHAR(255)             DEFAULT NULL,
    "workspaceId"            BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                     BIGSERIAL,
    "boughtByUserId"         BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "credits_workspace_id" ON "credits" ("workspaceId");
CREATE INDEX IF NOT EXISTS "credits_workspace_id_expiration_date" ON "credits" ("workspaceId", "expirationDate");
CREATE INDEX IF NOT EXISTS "credits_nonzero_remaining_idx" ON "credits" ("workspaceId", "expirationDate") WHERE "consumedAmountMicroUsd" < "initialAmountMicroUsd";
CREATE UNIQUE INDEX IF NOT EXISTS "credits_invoice_unique_idx" ON "credits" ("invoiceOrLineItemId") WHERE "invoiceOrLineItemId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "credits_workspace_start_expiration_idx" ON "credits" ("workspaceId", "startDate", "expirationDate");
CREATE UNIQUE INDEX IF NOT EXISTS "credits_type_workspace_dates_unique_idx" ON "credits" ("workspaceId", "type", "startDate", "expirationDate") WHERE "startDate" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "coupons"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "code"            VARCHAR(64)              NOT NULL UNIQUE,
    "description"     VARCHAR(255),
    "discountType"    VARCHAR(32)              NOT NULL,
    "amount"          FLOAT                    NOT NULL,
    "durationMonths"  INTEGER                           DEFAULT NULL,
    "maxRedemptions"  INTEGER                           DEFAULT NULL,
    "redemptionCount" INTEGER                  NOT NULL DEFAULT 0,
    "expirationDate"  TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "archivedAt"      TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "id"              BIGSERIAL,
    "createdByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "coupons_created_by_user_idx" ON "coupons" ("createdByUserId");

CREATE TABLE IF NOT EXISTS "coupon_redemptions"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "redeemedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "metronomeCreditIds" VARCHAR(255)[]           NOT NULL DEFAULT ARRAY []::VARCHAR(255)[],
    "status"             VARCHAR(16)              NOT NULL DEFAULT 'pending',
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    "couponId"           BIGINT                   NOT NULL REFERENCES "coupons" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "redeemedByUserId"   BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "coupon_redemptions_workspace_idx" ON "coupon_redemptions" ("workspaceId");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_coupon_idx" ON "coupon_redemptions" ("couponId");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_redeemed_by_user_idx" ON "coupon_redemptions" ("redeemedByUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_coupon_workspace_active_idx" ON "coupon_redemptions" ("couponId", "workspaceId") WHERE "status" IN ('pending', 'active');

CREATE TABLE IF NOT EXISTS "programmatic_usage_configurations"
(
    "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "freeCreditMicroUsd"     BIGINT DEFAULT NULL,
    "defaultDiscountPercent" INTEGER                  NOT NULL,
    "paygCapMicroUsd"        BIGINT DEFAULT NULL,
    "dailyCapMicroUsd"       BIGINT DEFAULT NULL,
    "workspaceId"            BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                     BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "programmatic_usage_configurations_workspace_id" ON "programmatic_usage_configurations" ("workspaceId");

CREATE TABLE IF NOT EXISTS "credit_usage_configurations"
(
    "createdAt"                        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                        TIMESTAMP WITH TIME ZONE NOT NULL,
    "defaultDiscountPercent"           INTEGER                  NOT NULL DEFAULT 0,
    "paygEnabled"                      BOOLEAN                  NOT NULL DEFAULT false,
    "usageCapCredits"                  INTEGER                           DEFAULT NULL,
    "allowMemberUpgradeRequests"       BOOLEAN                  NOT NULL DEFAULT true,
    "upgradeRequestEmailEnabled"       BOOLEAN                  NOT NULL DEFAULT true,
    "defaultPoolCapAwuCredits"         INTEGER                           DEFAULT NULL,
    "programmaticMonthlyCapAwuCredits" INTEGER                           DEFAULT NULL,
    "autoSeatUpgradeEnabled"           BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"                      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                               BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_usage_configurations_workspace_id" ON "credit_usage_configurations" ("workspaceId");

CREATE TABLE IF NOT EXISTS "agent_configurations"
(
    "createdAt"                   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                   TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                         VARCHAR(255)             NOT NULL,
    "version"                     INTEGER                  NOT NULL DEFAULT 0,
    "status"                      VARCHAR(255)             NOT NULL DEFAULT 'active',
    "scope"                       VARCHAR(255)             NOT NULL DEFAULT 'workspace',
    "name"                        TEXT                     NOT NULL,
    "description"                 TEXT                     NOT NULL,
    "instructions"                TEXT,
    "instructionsHtml"            TEXT,
    "providerId"                  VARCHAR(255)             NOT NULL,
    "modelId"                     VARCHAR(255)             NOT NULL,
    "temperature"                 FLOAT                    NOT NULL DEFAULT '0.7',
    "reasoningEffort"             VARCHAR(255),
    "responseFormat"              JSONB                             DEFAULT NULL,
    "maxStepsPerRun"              INTEGER,
    "visualizationEnabled"        BOOLEAN                  NOT NULL DEFAULT false,
    "pictureUrl"                  TEXT                     NOT NULL,
    "reinforcement"               VARCHAR(255)             NOT NULL DEFAULT 'auto',
    "lastReinforcementAnalysisAt" TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "requestedSpaceIds"           BIGINT[]                 NOT NULL DEFAULT ARRAY []::BIGINT[],
    "workspaceId"                 BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                          BIGSERIAL,
    "authorId"                    BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "templateId"                  BIGINT REFERENCES "templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_configurations_workspace_id" ON "agent_configurations" ("workspaceId");
CREATE INDEX IF NOT EXISTS "agent_configurations_workspace_id_name" ON "agent_configurations" ("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "agent_configurations_workspace_id_status_name" ON "agent_configurations" ("workspaceId", "status", "name");
CREATE INDEX IF NOT EXISTS "partial_agent_config_active" ON "agent_configurations" ("workspaceId", "scope", "authorId") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "agent_configurations_s_id" ON "agent_configurations" ("sId");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_configurations_s_id_version" ON "agent_configurations" ("sId", "version");
CREATE INDEX IF NOT EXISTS "agent_configurations_workspace_id_author_id_s_id" ON "agent_configurations" ("workspaceId", "authorId", "sId");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_configuration_unique_active_name" ON "agent_configurations" ("workspaceId", "name") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "agent_configurations_status" ON "agent_configurations" ("status");

CREATE TABLE IF NOT EXISTS "agent_user_relations"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfiguration" VARCHAR(255)             NOT NULL,
    "favorite"           BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    "userId"             BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_user_relations_workspace_id_user_id" ON "agent_user_relations" ("workspaceId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_user_relation_config_workspace_user_idx" ON "agent_user_relations" ("workspaceId", "agentConfiguration", "userId");

CREATE TABLE IF NOT EXISTS "global_agent_settings"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentId"     VARCHAR(255)             NOT NULL,
    "status"      VARCHAR(255)             NOT NULL DEFAULT 'disabled',
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "global_agent_settings_workspace_id" ON "global_agent_settings" ("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "global_agent_settings_workspace_id_agent_id" ON "global_agent_settings" ("workspaceId", "agentId");

CREATE TABLE IF NOT EXISTS "tag_agents"
(
    "id"                   BIGSERIAL,
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "tagId"                BIGINT                   NOT NULL REFERENCES "tags" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE ("tagId", "agentConfigurationId"),
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tag_agents_tag_id_agent_configuration_id" ON "tag_agents" ("tagId", "agentConfigurationId");
CREATE INDEX IF NOT EXISTS "tag_agents_agent_configuration_id" ON "tag_agents" ("agentConfigurationId");
CREATE INDEX IF NOT EXISTS "tag_agents_workspace_id_agent_configuration_id" ON "tag_agents" ("workspaceId", "agentConfigurationId");

CREATE TABLE IF NOT EXISTS "group_agents"
(
    "id"                   BIGSERIAL,
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "groupId"              BIGINT                   NOT NULL REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "agentConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE ("groupId", "agentConfigurationId"),
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_agents_group_id_agent_configuration_id" ON "group_agents" ("groupId", "agentConfigurationId");
CREATE INDEX IF NOT EXISTS "group_agents_agent_configuration_id" ON "group_agents" ("agentConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_agents_workspace_id" ON "group_agents" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_agents_group_id" ON "group_agents" ("groupId");

CREATE TABLE IF NOT EXISTS "remote_mcp_servers"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "url"               VARCHAR(2048)            NOT NULL,
    "icon"              VARCHAR(255)             NOT NULL,
    "version"           TEXT                     NOT NULL DEFAULT '1.0.0',
    "cachedName"        VARCHAR(2048)            NOT NULL,
    "cachedDescription" TEXT,
    "cachedTools"       JSONB                             DEFAULT '[]',
    "lastSyncAt"        TIMESTAMP WITH TIME ZONE,
    "lastError"         TEXT                              DEFAULT NULL,
    "sharedSecret"      TEXT,
    "authorization"     JSONB                             DEFAULT NULL,
    "customHeaders"     JSONB                             DEFAULT NULL,
    "meta"              JSONB                             DEFAULT NULL,
    "workspaceId"       BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "remote_mcp_servers_workspace_id" ON "remote_mcp_servers" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "remote_mcp_servers_workspace_id_id" ON "remote_mcp_servers" ("workspaceId", "id");

CREATE TABLE IF NOT EXISTS "mcp_server_views"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt"           TIMESTAMP WITH TIME ZONE,
    "editedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "serverType"          VARCHAR(255)             NOT NULL,
    "name"                VARCHAR(255),
    "description"         VARCHAR(255),
    "internalMCPServerId" VARCHAR(255),
    "remoteMCPServerId"   BIGINT REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "oAuthUseCase"        VARCHAR(255),
    "oauthScope"          TEXT,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    "vaultId"             BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editedByUserId"      BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mcp_server_views_workspace_id_id" ON "mcp_server_views" ("workspaceId", "id");
CREATE INDEX IF NOT EXISTS "mcp_server_views_workspace_id_vault_id" ON "mcp_server_views" ("workspaceId", "vaultId");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_server_views_workspace_remote_mcp_server_vault_active" ON "mcp_server_views" ("workspaceId", "remoteMCPServerId", "vaultId") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_server_views_workspace_name_vault_active" ON "mcp_server_views" ("workspaceId", "name", "vaultId") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_server_views_workspace_internal_mcp_server_vault_active" ON "mcp_server_views" ("workspaceId", "internalMCPServerId", "vaultId") WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "mcp_server_connections"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectionId"        VARCHAR(255),
    "credentialId"        VARCHAR(255),
    "connectionType"      VARCHAR(255)             NOT NULL,
    "serverType"          VARCHAR(255)             NOT NULL,
    "internalMCPServerId" VARCHAR(255),
    "remoteMCPServerId"   BIGINT REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    "userId"              BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "mcp_server_connections_workspace_id_internal_m_c_p_server_id" ON "mcp_server_connections" ("workspaceId", "internalMCPServerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "mcp_server_connections_workspace_id_remote_m_c_p_server_id" ON "mcp_server_connections" ("workspaceId", "remoteMCPServerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "mcp_server_connections_workspace_id_connection_type_user_id" ON "mcp_server_connections" ("workspaceId", "connectionType", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_workspace_server_remote" ON "mcp_server_connections" ("workspaceId", "serverType", "remoteMCPServerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_workspace_server_internal" ON "mcp_server_connections" ("workspaceId", "serverType", "internalMCPServerId");

CREATE TABLE IF NOT EXISTS "remote_mcp_server_tool_metadata"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "remoteMCPServerId"   INTEGER REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "internalMCPServerId" VARCHAR(255),
    "toolName"            VARCHAR(255)             NOT NULL,
    "permission"          VARCHAR(255)             NOT NULL,
    "enabled"             BOOLEAN                  NOT NULL DEFAULT true,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "remote_mcp_server_tool_metadata_wid_serverid_tool_name" ON "remote_mcp_server_tool_metadata" ("workspaceId", "remoteMCPServerId", "toolName");
CREATE UNIQUE INDEX IF NOT EXISTS "remote_mcp_server_tool_metadata_wid_internalserversid_tool_name" ON "remote_mcp_server_tool_metadata" ("workspaceId", "internalMCPServerId", "toolName");

CREATE TABLE IF NOT EXISTS "internal_mcp_server_credentials"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "internalMCPServerId" VARCHAR(255)             NOT NULL,
    "sharedSecret"        TEXT,
    "customHeaders"       JSONB DEFAULT NULL,
    "encryptedKey"        TEXT  DEFAULT NULL,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_credential_serverid_uniq" ON "internal_mcp_server_credentials" ("workspaceId", "internalMCPServerId");

CREATE TABLE IF NOT EXISTS "conversation_mcp_server_views"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"       BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "mcpServerViewId"      BIGINT                   NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"               BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "enabled"              BOOLEAN                  NOT NULL DEFAULT true,
    "source"               VARCHAR(255)             NOT NULL,
    "agentConfigurationId" VARCHAR(255),
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "conversation_mcp_server_views_workspace_conversation_idx" ON "conversation_mcp_server_views" ("workspaceId", "conversationId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_conv_mcp_srv_views_wid_cid_msvi_null_agent" ON "conversation_mcp_server_views" ("workspaceId", "conversationId", "mcpServerViewId") WHERE "agentConfigurationId" IS NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_conv_mcp_srv_views_wid_cid_msvi_agent" ON "conversation_mcp_server_views" ("workspaceId",
                                                                                                                               "conversationId",
                                                                                                                               "mcpServerViewId",
                                                                                                                               "agentConfigurationId") WHERE "agentConfigurationId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_mcp_server_views_conversation_id" ON "conversation_mcp_server_views" ("conversationId");

CREATE TABLE IF NOT EXISTS "agent_mcp_server_configurations"
(
    "createdAt"                     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                     TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                           VARCHAR(255)             NOT NULL,
    "timeFrame"                     JSONB,
    "jsonSchema"                    JSONB,
    "additionalConfiguration"       JSONB                    NOT NULL,
    "appId"                         VARCHAR(255),
    "secretName"                    VARCHAR(255),
    "mcpServerViewId"               BIGINT                   NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "internalMCPServerId"           VARCHAR(255),
    "name"                          VARCHAR(255),
    "singleToolDescriptionOverride" VARCHAR(255),
    "workspaceId"                   BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                            BIGSERIAL,
    "agentConfigurationId"          BIGINT                   NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_server_configurations_agent_configuration_id" ON "agent_mcp_server_configurations" ("agentConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_srv_config_w_id_agent_config_id" ON "agent_mcp_server_configurations" ("workspaceId", "agentConfigurationId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_server_configurations_s_id" ON "agent_mcp_server_configurations" ("sId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_srv_config_mcp_srv_view_id" ON "agent_mcp_server_configurations" ("mcpServerViewId");

CREATE TABLE IF NOT EXISTS "agent_tables_query_configuration_tables"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "tableId"                  VARCHAR(512)             NOT NULL,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "mcpServerConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceId"             BIGINT                   NOT NULL REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceViewId"         BIGINT                   NOT NULL REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_tables_query_configuration_tables_data_source_id" ON "agent_tables_query_configuration_tables" ("dataSourceId");
CREATE INDEX IF NOT EXISTS "agent_tables_query_configuration_tables_data_source_view_id" ON "agent_tables_query_configuration_tables" ("dataSourceViewId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_tables_query_config_table_workspace_id_data_source_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "dataSourceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_tables_query_config_table_w_id_data_source_view_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "dataSourceViewId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_tables_query_config_workspace_id_mcp_srv_config_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "mcpServerConfigurationId");

CREATE TABLE IF NOT EXISTS "agent_data_source_configurations"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "parentsIn"                VARCHAR(255)[],
    "parentsNotIn"             VARCHAR(255)[],
    "tagsMode"                 VARCHAR(255),
    "tagsIn"                   VARCHAR(255)[],
    "tagsNotIn"                VARCHAR(255)[],
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "mcpServerConfigurationId" BIGINT REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceId"             BIGINT                   NOT NULL REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceViewId"         BIGINT REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_data_source_configurations_mcp_server_configuration_id" ON "agent_data_source_configurations" ("mcpServerConfigurationId");
CREATE INDEX IF NOT EXISTS "agent_data_source_configurations_data_source_id" ON "agent_data_source_configurations" ("dataSourceId");
CREATE INDEX IF NOT EXISTS "agent_data_source_configurations_data_source_view_id" ON "agent_data_source_configurations" ("dataSourceViewId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_data_source_config_workspace_id_mcp_srv_config_id" ON "agent_data_source_configurations" ("workspaceId", "mcpServerConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_data_source_configurations_workspace_id_data_source_id" ON "agent_data_source_configurations" ("workspaceId", "dataSourceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_data_source_config_workspace_id_data_source_view_id" ON "agent_data_source_configurations" ("workspaceId", "dataSourceViewId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_data_source_configurations_workspace_id" ON "agent_data_source_configurations" ("workspaceId");

CREATE TABLE IF NOT EXISTS "agent_project_configurations"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "mcpServerConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "projectId"                BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_project_config_workspace_id_mcp_srv_config_id" ON "agent_project_configurations" ("workspaceId", "mcpServerConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_project_config_workspace_id_project_id" ON "agent_project_configurations" ("workspaceId", "projectId");

CREATE TABLE IF NOT EXISTS "user_messages"
(
    "createdAt"                    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                    TIMESTAMP WITH TIME ZONE NOT NULL,
    "content"                      TEXT                     NOT NULL,
    "localMCPServerIds"            VARCHAR(255)[]           NOT NULL DEFAULT ARRAY []::VARCHAR(255)[],
    "clientSideMCPServerIds"       VARCHAR(255)[]           NOT NULL DEFAULT ARRAY []::VARCHAR(255)[],
    "userContextUsername"          VARCHAR(255)             NOT NULL,
    "userContextTimezone"          VARCHAR(255)             NOT NULL,
    "userContextFullName"          VARCHAR(255),
    "userContextEmail"             VARCHAR(255),
    "userContextProfilePictureUrl" VARCHAR(2048),
    "userContextOrigin"            VARCHAR(255)             NOT NULL,
    "userContextLastTriggerRunAt"  TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "userContextApiKeyId"          BIGINT REFERENCES "keys" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "userContextAuthMethod"        VARCHAR(50),
    "agenticMessageType"           VARCHAR(16),
    "agenticOriginMessageId"       VARCHAR(32),
    "workspaceId"                  BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                           BIGSERIAL,
    "userId"                       BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_messages_user_context_origin" ON "user_messages" ("userContextOrigin");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_messages_workspace_id" ON "user_messages" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_messages_user_context_api_key_id" ON "user_messages" ("userContextApiKeyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_messages_workspace_agentic_origin_idx" ON "user_messages" ("workspaceId", "agenticOriginMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_messages_workspace_id_date_created_at_user_id_idx" ON "user_messages" ("workspaceId", DATE(TIMEZONE('UTC', "createdAt")), "userId");

CREATE TABLE IF NOT EXISTS "agent_messages"
(
    "createdAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "runIds"                     VARCHAR(255)[],
    "status"                     VARCHAR(255)             NOT NULL DEFAULT 'created',
    "errorCode"                  VARCHAR(255),
    "errorMessage"               TEXT,
    "errorMetadata"              JSONB                             DEFAULT NULL,
    "skipToolsValidation"        BOOLEAN                  NOT NULL DEFAULT false,
    "agentConfigurationId"       VARCHAR(255)             NOT NULL,
    "agentConfigurationVersion"  INTEGER                  NOT NULL DEFAULT 0,
    "modelInteractionDurationMs" INTEGER                           DEFAULT NULL,
    "completedAt"                TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "prunedContext"              BOOLEAN                           DEFAULT false,
    "costCredits"                INTEGER                           DEFAULT NULL,
    "workspaceId"                BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                         BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_messages_workspace_id" ON "agent_messages" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_messages_workspace_id_agent_configuration_id" ON "agent_messages" ("workspaceId", "agentConfigurationId");

CREATE TABLE IF NOT EXISTS "agent_message_feedbacks"
(
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId"      VARCHAR(255),
    "agentConfigurationVersion" INTEGER,
    "thumbDirection"            VARCHAR(255),
    "content"                   TEXT,
    "isConversationShared"      BOOLEAN                  NOT NULL DEFAULT false,
    "dismissed"                 BOOLEAN                  NOT NULL DEFAULT false,
    "conversationId"            BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"               BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                        BIGSERIAL,
    "agentMessageId"            BIGINT REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"                    BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_message_feedbacks_agent_configuration_id" ON "agent_message_feedbacks" ("agentConfigurationId");
CREATE INDEX IF NOT EXISTS "agent_message_feedbacks_agent_message_id" ON "agent_message_feedbacks" ("agentMessageId");
CREATE INDEX IF NOT EXISTS "agent_message_feedbacks_user_id" ON "agent_message_feedbacks" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_message_feedbacks_agent_configuration_id_agent_message_id" ON "agent_message_feedbacks" ("agentConfigurationId", "agentMessageId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_message_feedbacks_workspace_id" ON "agent_message_feedbacks" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_message_feedbacks_conversation_id" ON "agent_message_feedbacks" ("conversationId");

CREATE TABLE IF NOT EXISTS "content_fragments"
(
    "createdAt"                    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                    TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                          VARCHAR(255)             NOT NULL,
    "title"                        TEXT                     NOT NULL,
    "contentType"                  VARCHAR(255)             NOT NULL,
    "sourceUrl"                    TEXT,
    "textBytes"                    INTEGER,
    "userContextProfilePictureUrl" VARCHAR(2048),
    "userContextUsername"          VARCHAR(255),
    "userContextFullName"          VARCHAR(255),
    "userContextEmail"             VARCHAR(255),
    "version"                      VARCHAR(255)             NOT NULL DEFAULT 'latest',
    "nodeId"                       VARCHAR(512),
    "nodeType"                     VARCHAR(255),
    "expiredReason"                VARCHAR(255),
    "spaceId"                      BIGINT REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"                  BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                           BIGSERIAL,
    "userId"                       BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "fileId"                       BIGINT REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "nodeDataSourceViewId"         BIGINT REFERENCES "data_source_views" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "content_fragments_file_id" ON "content_fragments" ("fileId");
CREATE INDEX IF NOT EXISTS "content_fragments_s_id_version" ON "content_fragments" ("sId", "version");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_fragments_space_id" ON "content_fragments" ("spaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_fragments_workspace_id_s_id_version" ON "content_fragments" ("workspaceId", "sId", "version");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_fragments_workspace_id_space_id" ON "content_fragments" ("workspaceId", "spaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_fragments_node_dsv_id" ON "content_fragments" ("nodeDataSourceViewId");

CREATE TABLE IF NOT EXISTS "compaction_messages"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "runIds"               VARCHAR(255)[],
    "sourceConversationId" VARCHAR(255),
    "status"               VARCHAR(255)             NOT NULL DEFAULT 'created',
    "content"              TEXT,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "compaction_messages_workspace_id" ON "compaction_messages" ("workspaceId");

CREATE TABLE IF NOT EXISTS "messages"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"                 VARCHAR(255)             NOT NULL,
    "version"             INTEGER                  NOT NULL DEFAULT 0,
    "visibility"          VARCHAR(255)             NOT NULL DEFAULT 'visible',
    "rank"                INTEGER                  NOT NULL,
    "branchId"            BIGINT                            DEFAULT NULL,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    "conversationId"      BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userMessageId"       BIGINT REFERENCES "user_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "agentMessageId"      BIGINT REFERENCES "agent_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "parentId"            BIGINT REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "contentFragmentId"   BIGINT REFERENCES "content_fragments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "compactionMessageId" BIGINT REFERENCES "compaction_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "messages_s_id" ON "messages" ("sId");
CREATE INDEX IF NOT EXISTS "messages_workspace_id_conversation_id_s_id" ON "messages" ("workspaceId", "conversationId", "sId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_workspace_id_conversation_id_rank_version" ON "messages" ("workspaceId", "conversationId", "rank", "version");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "messages_workspace_id_conversation_id_rank_version_branch_null" ON "messages" ("workspaceId", "conversationId", "rank", "version") WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "messages_workspace_id_conversation_id_rank_version_branch_id" ON "messages" ("workspaceId", "conversationId", "rank", "version", "branchId") WHERE "branchId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_branch_id" ON "messages" ("branchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_conversation_id" ON "messages" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_agent_message_id" ON "messages" ("agentMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_user_message_id" ON "messages" ("userMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_content_fragment_id" ON "messages" ("contentFragmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_compaction_message_id" ON "messages" ("compactionMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_parent_id" ON "messages" ("parentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_workspace_id_conversation_id_created_at" ON "messages" ("workspaceId", "conversationId", "createdAt");

CREATE TABLE IF NOT EXISTS "message_reactions"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "userContextUsername" VARCHAR(255)             NOT NULL,
    "userContextFullName" VARCHAR(255),
    "reaction"            VARCHAR(255)             NOT NULL,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    "messageId"           BIGINT                   NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"              BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_message_id_reaction_user_context_username" ON "message_reactions" ("messageId", "reaction", "userContextUsername");
CREATE INDEX IF NOT EXISTS "message_reactions_message_id" ON "message_reactions" ("messageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_reactions_user_id" ON "message_reactions" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_reactions_workspace_id" ON "message_reactions" ("workspaceId");

CREATE TABLE IF NOT EXISTS "mentions"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" VARCHAR(255),
    "userId"               BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "status"               VARCHAR(255)             NOT NULL DEFAULT 'approved',
    "dismissed"            BOOLEAN                           DEFAULT false,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "messageId"            BIGINT                   NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mentions_message_id" ON "mentions" ("messageId");
CREATE INDEX IF NOT EXISTS "mentions_workspace_id_message_id" ON "mentions" ("workspaceId", "messageId");
CREATE INDEX IF NOT EXISTS "mentions_agent_configuration_id_created_at" ON "mentions" ("agentConfigurationId", "createdAt");
CREATE INDEX IF NOT EXISTS "mentions_workspace_id_agent_configuration_id_created_at" ON "mentions" ("workspaceId", "agentConfigurationId", "createdAt");

CREATE TABLE IF NOT EXISTS "agent_data_retentions"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" VARCHAR(255)             NOT NULL,
    "retentionDays"        BIGINT                   NOT NULL,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_data_retention_unique_agent_workspace" ON "agent_data_retentions" ("workspaceId", "agentConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_data_retention_agent_configuration_id" ON "agent_data_retentions" ("agentConfigurationId");

CREATE TABLE IF NOT EXISTS "agent_step_contents"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentMessageId" BIGINT                   NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "step"           INTEGER                  NOT NULL,
    "index"          INTEGER                  NOT NULL,
    "version"        INTEGER                  NOT NULL DEFAULT 0,
    "type"           VARCHAR(255)             NOT NULL,
    "value"          JSONB                    NOT NULL,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_contents_workspace_agent_message_step_index_version" ON "agent_step_contents" ("workspaceId", "agentMessageId", "step", "index", "version");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_contents_agent_message_id" ON "agent_step_contents" ("agentMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_contents_workspace_id_agent_message_id" ON "agent_step_contents" ("workspaceId", "agentMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_contents_workspace_id_idx" ON "agent_step_contents" ("workspaceId", "agentMessageId") WHERE "type" = 'function_call';

CREATE TABLE IF NOT EXISTS "agent_mcp_actions"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "mcpServerConfigurationId" VARCHAR(255)             NOT NULL,
    "version"                  INTEGER                  NOT NULL DEFAULT 0,
    "status"                   VARCHAR(255)                      DEFAULT 'succeeded',
    "citationsAllocated"       INTEGER                  NOT NULL DEFAULT 0,
    "augmentedInputs"          JSONB                    NOT NULL DEFAULT '{}',
    "toolConfiguration"        JSONB                    NOT NULL DEFAULT '{}',
    "stepContext"              JSONB                    NOT NULL DEFAULT '{}',
    "executionDurationMs"      INTEGER                           DEFAULT NULL,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "agentMessageId"           BIGINT                   NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "stepContentId"            BIGINT REFERENCES "agent_step_contents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_actions_workspace_id_agent_message_id" ON "agent_mcp_actions" ("workspaceId", "agentMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_actions_step_content_id" ON "agent_mcp_actions" ("stepContentId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_workspace_agent_message_step_content_version" ON "agent_mcp_actions" ("workspaceId", "agentMessageId", "stepContentId", "version");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_workspace_agent_message_status" ON "agent_mcp_actions" ("workspaceId", "agentMessageId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_actions_agent_message_id" ON "agent_mcp_actions" ("agentMessageId");

CREATE TABLE IF NOT EXISTS "agent_mcp_action_output_items"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "content"                  JSONB                    NOT NULL,
    "contentGcsPath"           TEXT,
    "citations"                JSONB         DEFAULT NULL,
    "generatedFilePath"        VARCHAR(4096) DEFAULT NULL,
    "generatedFileContentType" VARCHAR(255)  DEFAULT NULL,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "agentMCPActionId"         BIGINT                   NOT NULL REFERENCES "agent_mcp_actions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "fileId"                   BIGINT REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_output_items_workspace_id" ON "agent_mcp_action_output_items" ("workspaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_output_items_workspace_id_id" ON "agent_mcp_action_output_items" ("workspaceId", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_output_items_agent_m_c_p_action_id" ON "agent_mcp_action_output_items" ("agentMCPActionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_output_items_file_id" ON "agent_mcp_action_output_items" ("fileId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_output_items_ws_action_gcs_path" ON "agent_mcp_action_output_items" ("workspaceId", "agentMCPActionId", "contentGcsPath");

CREATE TABLE IF NOT EXISTS "agent_step_content_tool_executions"
(
    "id"               BIGSERIAL,
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"   BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMessageId"   BIGINT                   NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMCPActionId" BIGINT                   NOT NULL REFERENCES "agent_mcp_actions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "stepContentId"    BIGINT                   NOT NULL REFERENCES "agent_step_contents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_agent_mcp_action_id" ON "agent_step_content_tool_executions" ("agentMCPActionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_step_content_id" ON "agent_step_content_tool_executions" ("stepContentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_sc_te_workspace_conversation_message" ON "agent_step_content_tool_executions" ("workspaceId", "conversationId", "agentMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_conversation_id" ON "agent_step_content_tool_executions" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_agent_message_id" ON "agent_step_content_tool_executions" ("agentMessageId");

CREATE TABLE IF NOT EXISTS "agent_child_agent_configurations"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId"     VARCHAR(255)             NOT NULL,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "mcpServerConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_child_agent_configurations_mcp_server_configuration_id" ON "agent_child_agent_configurations" ("mcpServerConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_child_agent_config_workspace_id_mcp_srv_config_id" ON "agent_child_agent_configurations" ("workspaceId", "mcpServerConfigurationId");

CREATE TABLE IF NOT EXISTS "feature_flags"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"        VARCHAR(255)             NOT NULL,
    "groupIds"    INTEGER[] DEFAULT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "feature_flags"."groupIds" IS 'Per-group feature flag targeting. NULL means workspace-wide (current behavior), an array of group IDs means the flag is only enabled for users who belong to at least one of those groups.';

CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_workspace_id_name" ON "feature_flags" ("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "feature_flags_workspace_id" ON "feature_flags" ("workspaceId");

CREATE TABLE IF NOT EXISTS "global_feature_flags"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"              VARCHAR(255)             NOT NULL,
    "rolloutPercentage" INTEGER                  NOT NULL DEFAULT 100,
    "id"                BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "global_feature_flags_name" ON "global_feature_flags" ("name");

CREATE TABLE IF NOT EXISTS "kill_switches"
(
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "type"      VARCHAR(255)             NOT NULL,
    "id"        BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kill_switches_type" ON "kill_switches" ("type");

CREATE TABLE IF NOT EXISTS "labs_transcripts_configurations"
(
    "createdAt"                       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                       TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectionId"                    VARCHAR(255),
    "provider"                        VARCHAR(255)             NOT NULL,
    "agentConfigurationId"            VARCHAR(255),
    "status"                          VARCHAR(255)             NOT NULL DEFAULT 'disabled',
    "isDefaultWorkspaceConfiguration" BOOLEAN                  NOT NULL DEFAULT false,
    "credentialId"                    VARCHAR(255),
    "useConnectorConnection"          BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"                     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                              BIGSERIAL,
    "userId"                          BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "dataSourceViewId"                BIGINT REFERENCES "data_source_views" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "labs_transcripts_configurations_user_id" ON "labs_transcripts_configurations" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "labs_transcripts_configurations_user_id_workspace_id" ON "labs_transcripts_configurations" ("userId", "workspaceId");
CREATE INDEX IF NOT EXISTS "labs_transcripts_configurations_data_source_view_id" ON "labs_transcripts_configurations" ("dataSourceViewId");

CREATE TABLE IF NOT EXISTS "labs_transcripts_histories"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "fileId"          VARCHAR(255)             NOT NULL,
    "fileName"        VARCHAR(255)             NOT NULL,
    "conversationId"  VARCHAR(255),
    "stored"          BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    "configurationId" BIGINT                   NOT NULL REFERENCES "labs_transcripts_configurations" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "labs_transcripts_histories_file_configuration_id" ON "labs_transcripts_histories" ("fileId", "configurationId");
CREATE UNIQUE INDEX IF NOT EXISTS "labs_transcripts_histories_workspace_configuration_file_id" ON "labs_transcripts_histories" ("workspaceId", "configurationId", "fileId");

CREATE TABLE IF NOT EXISTS "plugin_runs"
(
    "args"         VARCHAR(1024),
    "author"       VARCHAR(255)             NOT NULL,
    "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "pluginId"     VARCHAR(255)             NOT NULL,
    "result"       VARCHAR(4096),
    "status"       VARCHAR(255)             NOT NULL,
    "error"        VARCHAR(4096),
    "resourceType" VARCHAR(255)             NOT NULL,
    "resourceId"   VARCHAR(255),
    "id"           BIGSERIAL,
    "workspaceId"  BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "plugin_runs_workspace_id" ON "plugin_runs" ("workspaceId");
CREATE INDEX IF NOT EXISTS "plugin_runs_resource_type_resource_id" ON "plugin_runs" ("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "plugin_runs_workspace_id_resource_type_resource_id_created_at" ON "plugin_runs" ("workspaceId", "resourceType", "resourceId", "createdAt");

CREATE TABLE IF NOT EXISTS "agent_memories"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" VARCHAR(255)             NOT NULL,
    "content"              TEXT                     NOT NULL,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "userId"               BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_memories_workspace_agent_configuration_user_updated_at" ON "agent_memories" ("workspaceId", "agentConfigurationId", "userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "onboarding_tasks"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "context"     TEXT                     NOT NULL,
    "kind"        VARCHAR(255)             NOT NULL,
    "toolName"    VARCHAR(255),
    "completedAt" TIMESTAMP WITH TIME ZONE,
    "skippedAt"   TIMESTAMP WITH TIME ZONE,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    "userId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "onboarding_tasks_workspace_user" ON "onboarding_tasks" ("workspaceId", "userId");

CREATE TABLE IF NOT EXISTS "user_tool_approvals"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "mcpServerId"      VARCHAR(255)             NOT NULL,
    "toolName"         VARCHAR(255)             NOT NULL,
    "agentId"          VARCHAR(255) DEFAULT NULL,
    "argsAndValues"    JSONB        DEFAULT NULL,
    "argsAndValuesMd5" VARCHAR(255) DEFAULT NULL,
    "workspaceId"      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    "userId"           BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_tool_approvals_unique_idx" ON "user_tool_approvals" ("workspaceId", "userId",
                                                                                             "mcpServerId",
                                                                                             "toolName", "agentId",
                                                                                             "argsAndValuesMd5");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_tool_approvals_user_id" ON "user_tool_approvals" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_tool_approvals_workspace_id_user_id" ON "user_tool_approvals" ("workspaceId", "userId");

CREATE TABLE IF NOT EXISTS "skill_configurations"
(
    "createdAt"                         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                         TIMESTAMP WITH TIME ZONE NOT NULL,
    "status"                            VARCHAR(255)             NOT NULL,
    "name"                              TEXT                     NOT NULL,
    "agentFacingDescription"            TEXT                     NOT NULL,
    "userFacingDescription"             TEXT,
    "instructions"                      TEXT                     NOT NULL,
    "instructionsHtml"                  TEXT,
    "requestedSpaceIds"                 BIGINT[]                 NOT NULL,
    "icon"                              TEXT,
    "extendedSkillId"                   TEXT,
    "source"                            VARCHAR(255),
    "sourceMetadata"                    JSONB,
    "isDefault"                         BOOLEAN                  NOT NULL DEFAULT false,
    "reinforcement"                     VARCHAR(255)             NOT NULL DEFAULT 'on',
    "lastReinforcementAnalysisAt"       TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "selfImprovementCostsCapMicroUsd"   BIGINT                            DEFAULT NULL,
    "selfImprovementCostsCapAwuCredits" BIGINT                            DEFAULT NULL,
    "selfImprovementLock"               BOOLEAN                  NOT NULL DEFAULT false,
    "workspaceId"                       BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                                BIGSERIAL,
    "editedBy"                          BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_configurations_workspace_id_status" ON "skill_configurations" ("workspaceId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_configurations_workspace_id_status_is_default" ON "skill_configurations" ("workspaceId", "status", "isDefault");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_configurations_workspace_id_edited_by" ON "skill_configurations" ("workspaceId", "editedBy");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "skill_configurations_workspace_id_name_status" ON "skill_configurations" ("workspaceId", "name", "status");

CREATE TABLE IF NOT EXISTS "skill_data_source_configurations"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "skillConfigurationId" BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "dataSourceId"         BIGINT                   NOT NULL REFERENCES "data_sources" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "dataSourceViewId"     BIGINT                   NOT NULL REFERENCES "data_source_views" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "parentsIn"            VARCHAR(255)[]           NOT NULL,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_skill_data_source_config_workspace_skill_config" ON "skill_data_source_configurations" ("workspaceId", "skillConfigurationId");
CREATE INDEX IF NOT EXISTS "idx_skill_data_source_config_workspace_data_source" ON "skill_data_source_configurations" ("workspaceId", "dataSourceId");
CREATE INDEX IF NOT EXISTS "idx_skill_data_source_config_workspace_data_source_view" ON "skill_data_source_configurations" ("workspaceId", "dataSourceViewId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_data_source_config_workspace_skill_data_source_view" ON "skill_data_source_configurations" ("workspaceId", "skillConfigurationId", "dataSourceViewId");

CREATE TABLE IF NOT EXISTS "skill_versions"
(
    "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "status"                 VARCHAR(255)             NOT NULL,
    "name"                   TEXT                     NOT NULL,
    "agentFacingDescription" TEXT                     NOT NULL,
    "userFacingDescription"  TEXT,
    "instructions"           TEXT                     NOT NULL,
    "instructionsHtml"       TEXT,
    "requestedSpaceIds"      BIGINT[]                 NOT NULL,
    "icon"                   TEXT,
    "extendedSkillId"        TEXT,
    "source"                 VARCHAR(255),
    "sourceMetadata"         JSONB,
    "isDefault"              BOOLEAN                  NOT NULL DEFAULT false,
    "skillConfigurationId"   BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "mcpServerViewIds"       BIGINT[]                 NOT NULL,
    "fileAttachmentIds"      BIGINT[]                 NOT NULL DEFAULT ARRAY []::BIGINT[],
    "version"                INTEGER                  NOT NULL,
    "workspaceId"            BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                     BIGSERIAL,
    "editedBy"               BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_versions_workspace_id_skill_configuration_id" ON "skill_versions" ("workspaceId", "skillConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_versions_workspace_id_edited_by" ON "skill_versions" ("workspaceId", "editedBy");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "skill_versions_workspace_id_skill_configuration_id_version" ON "skill_versions" ("workspaceId", "skillConfigurationId", "version");

CREATE TABLE IF NOT EXISTS "group_skills"
(
    "id"                   BIGSERIAL,
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "groupId"              BIGINT                   NOT NULL REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "skillConfigurationId" BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_skills_workspace_id_skill_configuration_id" ON "group_skills" ("workspaceId", "skillConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_skills_skill_configuration_id" ON "group_skills" ("skillConfigurationId");

CREATE TABLE IF NOT EXISTS "skill_references"
(
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "parentSkillId"      BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "childCustomSkillId" BIGINT REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "childGlobalSkillId" VARCHAR(255),
    "workspaceId"        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "skill_references_workspace_parent_child_idx" ON "skill_references" ("workspaceId", "parentSkillId", "childCustomSkillId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_references_parent_skill_id_idx" ON "skill_references" ("parentSkillId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_references_child_skill_id_idx" ON "skill_references" ("childCustomSkillId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_references_child_global_skill_id_idx" ON "skill_references" ("workspaceId", "childGlobalSkillId") WHERE "childGlobalSkillId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "agent_skills"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "customSkillId"        BIGINT REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "globalSkillId"        VARCHAR(255),
    "agentConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    UNIQUE ("customSkillId", "agentConfigurationId"),
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_skills_workspace_id_agent_configuration_id" ON "agent_skills" ("workspaceId", "agentConfigurationId");
CREATE INDEX IF NOT EXISTS "idx_agent_skills_workspace_custom_skill" ON "agent_skills" ("workspaceId", "customSkillId") WHERE "customSkillId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_agent_skills_workspace_global_skill" ON "agent_skills" ("workspaceId", "globalSkillId") WHERE "globalSkillId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "conversation_skills"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" VARCHAR(255),
    "customSkillId"        BIGINT REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "globalSkillId"        VARCHAR(255),
    "conversationId"       BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "source"               VARCHAR(255)             NOT NULL,
    "addedByUserId"        BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_conversation_skills_workspace_conv_agent" ON "conversation_skills" ("workspaceId", "conversationId", "agentConfigurationId");
CREATE INDEX IF NOT EXISTS "idx_conversation_skills_workspace_conv_agent_custom_skill" ON "conversation_skills" ("workspaceId",
                                                                                                                 "conversationId",
                                                                                                                 "agentConfigurationId",
                                                                                                                 "customSkillId") WHERE "customSkillId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_conversation_skills_workspace_conv_agent_global_skill" ON "conversation_skills" ("workspaceId",
                                                                                                                 "conversationId",
                                                                                                                 "agentConfigurationId",
                                                                                                                 "globalSkillId") WHERE "globalSkillId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_conversation_skills_conversation_id" ON "conversation_skills" ("conversationId");

CREATE TABLE IF NOT EXISTS "agent_message_skills"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" VARCHAR(255),
    "customSkillId"        BIGINT REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "globalSkillId"        VARCHAR(255),
    "conversationId"       BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "source"               VARCHAR(255)             NOT NULL,
    "addedByUserId"        BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "agentMessageId"       BIGINT                   NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_agent_message_skills_workspace_message" ON "agent_message_skills" ("workspaceId", "agentMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_message_skills_conversation_id" ON "agent_message_skills" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_message_skills_agent_message_id" ON "agent_message_skills" ("agentMessageId");

CREATE TABLE IF NOT EXISTS "skill_mcp_server_configurations"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "mcpServerViewId"      BIGINT                   NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "skillConfigurationId" BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_skill_mcp_server_config_workspace_skill_config" ON "skill_mcp_server_configurations" ("workspaceId", "skillConfigurationId");

CREATE TABLE IF NOT EXISTS "skill_file_attachments"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "skillConfigurationId" BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "fileId"               BIGINT                   NOT NULL REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "fileName"             TEXT                     NOT NULL,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_skill_file_attachment_workspace_skill_config" ON "skill_file_attachments" ("workspaceId", "skillConfigurationId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_file_attachment_workspace_file" ON "skill_file_attachments" ("workspaceId", "fileId");

CREATE TABLE IF NOT EXISTS "skill_suggestions"
(
    "createdAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "skillConfigurationId"       BIGINT                   NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "kind"                       VARCHAR(255)             NOT NULL,
    "suggestion"                 JSONB                    NOT NULL,
    "analysis"                   TEXT,
    "title"                      VARCHAR(255),
    "state"                      VARCHAR(255)             NOT NULL DEFAULT 'pending',
    "source"                     VARCHAR(255)             NOT NULL,
    "sourceConversationIds"      BIGINT[],
    "updatedByUserId"            BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "notificationConversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "workspaceId"                BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                         BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "skill_suggestions"."sourceConversationIds" IS 'Array of conversation model IDs that contributed to this reinforcement suggestion.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_suggestions_list_by_skill_configuration_idx" ON "skill_suggestions" ("workspaceId", "skillConfigurationId", "state", "kind");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_suggestions_workspace_state" ON "skill_suggestions" ("workspaceId", "state");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_suggestions_workspace_skill_config_kind" ON "skill_suggestions" ("skillConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_suggestions_updated_by_user_id" ON "skill_suggestions" ("updatedByUserId") WHERE "updatedByUserId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_suggestions_notification_conversation_id" ON "skill_suggestions" ("notificationConversationId");

CREATE TABLE IF NOT EXISTS "self_improving_skills_usage"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "skillId"         BIGINT REFERENCES "skill_configurations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "conversationId"  BIGINT REFERENCES "conversations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "priceMicroUsd"   BIGINT                   NOT NULL,
    "priceAwuCredits" BIGINT                   NOT NULL DEFAULT 0,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "self_improving_skills_usage_workspace_created_at_idx" ON "self_improving_skills_usage" ("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "self_imp_skills_usage_workspace_skill_created_at_idx" ON "self_improving_skills_usage" ("workspaceId", "skillId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "self_improving_skills_usage_conversation_id_idx" ON "self_improving_skills_usage" ("conversationId");

CREATE TABLE IF NOT EXISTS "workspace_verification_attempts"
(
    "createdAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "phoneNumberHash"       VARCHAR(64)              NOT NULL,
    "twilioVerificationSid" VARCHAR(64)                       DEFAULT NULL,
    "attemptNumber"         INTEGER                  NOT NULL DEFAULT 1,
    "verifiedAt"            TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "workspaceId"           BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                    BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_verification_attempts_workspace_id" ON "workspace_verification_attempts" ("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_verification_attempts_phone_hash_unique_idx" ON "workspace_verification_attempts" ("phoneNumberHash") WHERE "verifiedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "workspace_verification_attempts_twilio_sid_idx" ON "workspace_verification_attempts" ("twilioVerificationSid") WHERE "twilioVerificationSid" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "agent_suggestions"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "kind"                 VARCHAR(255)             NOT NULL,
    "suggestion"           JSONB                    NOT NULL,
    "analysis"             TEXT,
    "state"                VARCHAR(255)             NOT NULL,
    "conversationId"       BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "agent_suggestions"."kind" IS 'Discriminator for the suggestion type (e.g., instructions, tools...)';
COMMENT ON COLUMN "agent_suggestions"."suggestion" IS 'JSONB payload containing the suggestion details, structure depends on kind';
COMMENT ON COLUMN "agent_suggestions"."analysis" IS 'Optional analysis/reasoning explaining why this suggestion was made';
COMMENT ON COLUMN "agent_suggestions"."state" IS 'Current state of the suggestion (e.g., pending, accepted, rejected...)';
COMMENT ON COLUMN "agent_suggestions"."conversationId" IS 'FK to the conversation that triggered this suggestion (only set for synthetic suggestions)';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_suggestions_list_by_agent_configuration_idx" ON "agent_suggestions" ("workspaceId", "agentConfigurationId", "state", "kind");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_suggestions_workspace_id_agent_configuration_id_kind" ON "agent_suggestions" ("workspaceId", "agentConfigurationId", "kind");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_suggestions_agent_configuration_id" ON "agent_suggestions" ("agentConfigurationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_suggestions_conversation_id" ON "agent_suggestions" ("conversationId");

CREATE TABLE IF NOT EXISTS "academy_quiz_attempts"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"            VARCHAR(255)             NOT NULL,
    "browserId"      VARCHAR(36),
    "contentType"    VARCHAR(255)             NOT NULL,
    "contentSlug"    VARCHAR(255)             NOT NULL,
    "courseSlug"     VARCHAR(255),
    "correctAnswers" INTEGER                  NOT NULL,
    "totalQuestions" INTEGER                  NOT NULL,
    "isPassed"       BOOLEAN                  NOT NULL,
    "id"             BIGSERIAL,
    "userId"         BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_user_id" ON "academy_quiz_attempts" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_user_id_content_type_content_slug" ON "academy_quiz_attempts" ("userId", "contentType", "contentSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_user_id_course_slug" ON "academy_quiz_attempts" ("userId", "courseSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_browser_id" ON "academy_quiz_attempts" ("browserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_browser_id_content_type_content_slug" ON "academy_quiz_attempts" ("browserId", "contentType", "contentSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_quiz_attempts_browser_id_course_slug" ON "academy_quiz_attempts" ("browserId", "courseSlug");

CREATE TABLE IF NOT EXISTS "academy_chapter_visits"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"         VARCHAR(255)             NOT NULL,
    "browserId"   VARCHAR(36),
    "courseSlug"  VARCHAR(255)             NOT NULL,
    "chapterSlug" VARCHAR(255)             NOT NULL,
    "id"          BIGSERIAL,
    "userId"      BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_user_id_course_chapter_unique" ON "academy_chapter_visits" ("userId", "courseSlug", "chapterSlug");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_browser_id_course_chapter_unique" ON "academy_chapter_visits" ("browserId", "courseSlug", "chapterSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_user_id_course_slug" ON "academy_chapter_visits" ("userId", "courseSlug");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_user_id" ON "academy_chapter_visits" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "academy_chapter_visits_browser_id" ON "academy_chapter_visits" ("browserId");

CREATE TABLE IF NOT EXISTS "sandboxes"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"  BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "providerId"      VARCHAR(255)             NOT NULL,
    "status"          VARCHAR(255)             NOT NULL DEFAULT 'running',
    "statusChangedAt" TIMESTAMP WITH TIME ZONE,
    "lastActivityAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
    "baseImage"       VARCHAR(255),
    "version"         VARCHAR(255),
    "killRequestedAt" TIMESTAMP WITH TIME ZONE,
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sandboxes_workspace_conversation_idx" ON "sandboxes" ("workspaceId", "conversationId");
CREATE INDEX IF NOT EXISTS "sandboxes_status_last_activity_idx" ON "sandboxes" ("status", "lastActivityAt");
CREATE INDEX IF NOT EXISTS "sandboxes_kill_requested_at_idx" ON "sandboxes" ("killRequestedAt") WHERE "killRequestedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "sandboxes_base_image_version_idx" ON "sandboxes" ("baseImage", "version");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sandboxes_conversation_id_idx" ON "sandboxes" ("conversationId");

CREATE TABLE IF NOT EXISTS "conversation_branches"
(
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "state"             VARCHAR(255)             NOT NULL,
    "workspaceId"       BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    "conversationId"    BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"            BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "previousMessageId" BIGINT                   NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "conversation_branches_workspace_id_conversation_id_user_id" ON "conversation_branches" ("workspaceId", "conversationId", "userId");
CREATE INDEX IF NOT EXISTS "conversation_branches_previous_message_id" ON "conversation_branches" ("previousMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_branches_conversation_id" ON "conversation_branches" ("conversationId");

CREATE TABLE IF NOT EXISTS "conversation_forks"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "branchedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "fileCopyStatus"       VARCHAR(255)             NOT NULL DEFAULT 'done',
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "parentConversationId" BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "childConversationId"  BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByUserId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceMessageId"      BIGINT                   NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_forks_child_conversation_id" ON "conversation_forks" ("childConversationId");
CREATE INDEX IF NOT EXISTS "conversation_forks_workspace_id_parent_conversation_id" ON "conversation_forks" ("workspaceId", "parentConversationId");
CREATE INDEX IF NOT EXISTS "conversation_forks_workspace_id_source_message_id" ON "conversation_forks" ("workspaceId", "sourceMessageId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_parent_conversation_id" ON "conversation_forks" ("parentConversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_created_by_user_id" ON "conversation_forks" ("createdByUserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_source_message_id" ON "conversation_forks" ("sourceMessageId");

CREATE TABLE IF NOT EXISTS "project_todos"
(
    "createdAt"                          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                          TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"                            BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"                             BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByUserId"                    BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByType"                      VARCHAR(255)             NOT NULL,
    "createdByAgentConfigurationId"      VARCHAR(255),
    "markedAsDoneByType"                 VARCHAR(255),
    "markedAsDoneByUserId"               BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "markedAsDoneByAgentConfigurationId" VARCHAR(255),
    "category"                           VARCHAR(255)             NOT NULL,
    "text"                               TEXT                     NOT NULL,
    "status"                             VARCHAR(255)             NOT NULL DEFAULT 'todo',
    "doneAt"                             TIMESTAMP WITH TIME ZONE,
    "actorRationale"                     TEXT,
    "agentInstructions"                  TEXT,
    "deletedAt"                          TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "agentSuggestionStatus"              VARCHAR(255)                      DEFAULT NULL,
    "agentSuggestionReviewedAt"          TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "agentSuggestionReviewedByUserId"    BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"                        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                                 BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "project_todos"."userId" IS 'Owner of the todo — null when the todo is not assigned to a specific user.';
COMMENT ON COLUMN "project_todos"."createdByUserId" IS 'Set when createdByType is user.';
COMMENT ON COLUMN "project_todos"."createdByType" IS 'Actor type that created this todo: user or agent.';
COMMENT ON COLUMN "project_todos"."createdByAgentConfigurationId" IS 'sId of the agent configuration when createdByType is agent.';
COMMENT ON COLUMN "project_todos"."markedAsDoneByType" IS 'Actor type that completed this todo: user or agent.';
COMMENT ON COLUMN "project_todos"."markedAsDoneByUserId" IS 'Set when markedAsDoneByType is user.';
COMMENT ON COLUMN "project_todos"."markedAsDoneByAgentConfigurationId" IS 'sId of the agent configuration when markedAsDoneByType is agent.';
COMMENT ON COLUMN "project_todos"."category" IS 'Category of the todo: to_do, to_know.';
COMMENT ON COLUMN "project_todos"."actorRationale" IS 'Explanation for why the actor made a change.';
COMMENT ON COLUMN "project_todos"."agentInstructions" IS 'Optional kickoff instructions for the agent when this todo is started.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todos_ws_space_user_idx" ON "project_todos" ("workspaceId", "spaceId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todos_spaceId_idx" ON "project_todos" ("spaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todos_userId_idx" ON "project_todos" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todos_createdByUserId_idx" ON "project_todos" ("createdByUserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todos_markedAsDoneByUserId_idx" ON "project_todos" ("markedAsDoneByUserId");

CREATE TABLE IF NOT EXISTS "project_todo_conversations"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectTodoId"  BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "conversationId" BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_conversations_ws_todo_idx" ON "project_todo_conversations" ("workspaceId", "projectTodoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_conversations_projectTodoId_idx" ON "project_todo_conversations" ("projectTodoId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_conversations_ws_unique_idx" ON "project_todo_conversations" ("workspaceId", "projectTodoId", "conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_conversations_conversationId_idx" ON "project_todo_conversations" ("conversationId");

CREATE TABLE IF NOT EXISTS "project_todo_sources"
(
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectTodoId" BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "itemId"        VARCHAR(255)             NOT NULL,
    "sourceType"    VARCHAR(255)             NOT NULL,
    "sourceId"      VARCHAR(255)             NOT NULL,
    "sourceTitle"   TEXT,
    "sourceUrl"     TEXT,
    "workspaceId"   BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "project_todo_sources"."itemId" IS 'sId of the takeaway item that produced this source link.';
COMMENT ON COLUMN "project_todo_sources"."sourceType" IS 'Type of content node that led to creating this todo.';
COMMENT ON COLUMN "project_todo_sources"."sourceId" IS 'String identifier of the source (conversation sId, external URL/ID, etc.) that led to creating this todo.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_sources_ws_todo_idx" ON "project_todo_sources" ("workspaceId", "projectTodoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_sources_projectTodoId_idx" ON "project_todo_sources" ("projectTodoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_sources_sourceType_sourceId_idx" ON "project_todo_sources" ("sourceType", "sourceId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_sources_ws_todo_source_unique_idx" ON "project_todo_sources" ("workspaceId", "projectTodoId", "sourceType", "sourceId");

CREATE TABLE IF NOT EXISTS "project_todo_states"
(
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastReadAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastCleanedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "spaceId"       BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"        BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"   BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "project_todo_states"."userId" IS 'Owner of the state.';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_states_workspace_id_space_id_user_id" ON "project_todo_states" ("workspaceId", "spaceId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_states_space_id" ON "project_todo_states" ("spaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_states_user_id" ON "project_todo_states" ("userId");

CREATE TABLE IF NOT EXISTS "project_todo_versions"
(
    "createdAt"                          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                          TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"                            BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"                             BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByUserId"                    BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByType"                      VARCHAR(255)             NOT NULL,
    "createdByAgentConfigurationId"      VARCHAR(255),
    "markedAsDoneByType"                 VARCHAR(255),
    "markedAsDoneByUserId"               BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "markedAsDoneByAgentConfigurationId" VARCHAR(255),
    "category"                           VARCHAR(255)             NOT NULL,
    "text"                               TEXT                     NOT NULL,
    "status"                             VARCHAR(255)             NOT NULL DEFAULT 'todo',
    "doneAt"                             TIMESTAMP WITH TIME ZONE,
    "actorRationale"                     TEXT,
    "agentInstructions"                  TEXT,
    "deletedAt"                          TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "agentSuggestionStatus"              VARCHAR(255)                      DEFAULT NULL,
    "agentSuggestionReviewedAt"          TIMESTAMP WITH TIME ZONE          DEFAULT NULL,
    "agentSuggestionReviewedByUserId"    BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "projectTodoId"                      BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "version"                            INTEGER                  NOT NULL,
    "workspaceId"                        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                                 BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "project_todo_versions"."userId" IS 'Owner of the todo — null when the todo is not assigned to a specific user.';
COMMENT ON COLUMN "project_todo_versions"."createdByUserId" IS 'Set when createdByType is user.';
COMMENT ON COLUMN "project_todo_versions"."createdByType" IS 'Actor type that created this todo: user or agent.';
COMMENT ON COLUMN "project_todo_versions"."createdByAgentConfigurationId" IS 'sId of the agent configuration when createdByType is agent.';
COMMENT ON COLUMN "project_todo_versions"."markedAsDoneByType" IS 'Actor type that completed this todo: user or agent.';
COMMENT ON COLUMN "project_todo_versions"."markedAsDoneByUserId" IS 'Set when markedAsDoneByType is user.';
COMMENT ON COLUMN "project_todo_versions"."markedAsDoneByAgentConfigurationId" IS 'sId of the agent configuration when markedAsDoneByType is agent.';
COMMENT ON COLUMN "project_todo_versions"."category" IS 'Category of the todo: to_do, to_know.';
COMMENT ON COLUMN "project_todo_versions"."actorRationale" IS 'Explanation for why the actor made a change.';
COMMENT ON COLUMN "project_todo_versions"."agentInstructions" IS 'Optional kickoff instructions for the agent when this todo is started.';
COMMENT ON COLUMN "project_todo_versions"."version" IS 'Monotonically increasing per projectTodoId.';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_versions_ws_todo_version_unique_idx" ON "project_todo_versions" ("workspaceId", "projectTodoId", "version");

CREATE TABLE IF NOT EXISTS "takeaways"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"     BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "actionItems" JSONB                    NOT NULL DEFAULT '[]',
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "takeaways"."spaceId" IS 'The space (project) this takeaway belongs to.';
COMMENT ON COLUMN "takeaways"."actionItems" IS 'Detected action items with assignee, status, and source message rank.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "takeaways_spaceId_idx" ON "takeaways" ("spaceId");

CREATE TABLE IF NOT EXISTS "takeaway_sources"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "takeawaysId" BIGINT                   NOT NULL REFERENCES "takeaways" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceType"  VARCHAR(255)             NOT NULL,
    "sourceId"    VARCHAR(255)             NOT NULL,
    "sourceTitle" TEXT,
    "sourceUrl"   TEXT,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "takeaway_sources"."takeawaysId" IS 'FK to the TakeawaysModel row this source produced.';
COMMENT ON COLUMN "takeaway_sources"."sourceType" IS 'Type of content node that produced this takeaway.';
COMMENT ON COLUMN "takeaway_sources"."sourceId" IS 'String identifier of the source (internal SID or external URL/ID) that produced this takeaway.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "takeaway_sources_ws_takeawaysId_idx" ON "takeaway_sources" ("workspaceId", "takeawaysId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "takeaway_sources_sourceType_sourceId_idx" ON "takeaway_sources" ("sourceType", "sourceId");

CREATE TABLE IF NOT EXISTS "takeaway_versions"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"     BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "actionItems" JSONB                    NOT NULL DEFAULT '[]',
    "takeawaysId" BIGINT                   NOT NULL REFERENCES "takeaways" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "version"     INTEGER                  NOT NULL,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);
COMMENT ON COLUMN "takeaway_versions"."spaceId" IS 'The space (project) this takeaway belongs to.';
COMMENT ON COLUMN "takeaway_versions"."actionItems" IS 'Detected action items with assignee, status, and source message rank.';
COMMENT ON COLUMN "takeaway_versions"."version" IS 'Monotonically increasing per takeawaysId. Each butler run inserts a new row rather than overwriting.';
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "takeaway_versions_ws_takeawaysId_version_unique_idx" ON "takeaway_versions" ("workspaceId", "takeawaysId", "version");
CREATE TABLE IF NOT EXISTS "user_project_preferences"
(
    "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL,
    "notificationPreference" VARCHAR(255),
    "isStarred"              BOOLEAN,
    "workspaceId"            BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                     BIGSERIAL,
    "userId"                 BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "spaceId"                BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "user_project_preferences_workspace_user_space_unique" ON "user_project_preferences" ("workspaceId", "userId", "spaceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_project_preferences_workspace_id_space_id" ON "user_project_preferences" ("workspaceId", "spaceId");
CREATE TABLE IF NOT EXISTS "workspace_sensitivity_label_configs"
(
    "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL,
    "sourceType"    VARCHAR(255)             NOT NULL,
    "sourceId"      VARCHAR(255)             NOT NULL,
    "allowedLabels" JSONB                    NOT NULL DEFAULT '[]',
    "workspaceId"   BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"            BIGSERIAL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "workspace_sensitivity_label_configs_workspace_source_idx" ON "workspace_sensitivity_label_configs" ("workspaceId", "sourceType", "sourceId");
CREATE TABLE IF NOT EXISTS "workspace_sandbox_env_vars"
(
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "name"                VARCHAR(255)             NOT NULL,
    "kind"                TEXT                     NOT NULL DEFAULT 'config',
    "placeholder_nonce"   BYTEA,
    "allowed_domains"     TEXT[],
    "encryptedValue"      TEXT                     NOT NULL,
    "workspaceId"         BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                  BIGSERIAL,
    "createdByUserId"     BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "lastUpdatedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_sandbox_env_vars_workspace_name_idx" ON "workspace_sandbox_env_vars" ("workspaceId", "name");
CREATE TABLE IF NOT EXISTS "workspace_seat_limits"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "seatType"    VARCHAR(255)             NOT NULL,
    "minSeats"    INTEGER                  NOT NULL DEFAULT 0,
    "maxSeats"    INTEGER,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_seat_limits_workspace_seat_type_idx" ON "workspace_seat_limits" ("workspaceId", "seatType");
