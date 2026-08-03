import { z } from "zod";

// Converts number-typed values to strings (handles minimist auto-parsing of numeric CLI args).
const cliArg = z.preprocess(
  (val) => (typeof val === "number" ? String(val) : val),
  z.union([z.string(), z.undefined()])
);

// Generic CLI args record: accepts strings, numbers (converted to strings), and undefined.
const cliArgs = z.record(z.string(), cliArg);

/**
 * <Connectors>
 */
export const ConnectorsCommandSchema = z.object({
  majorCommand: z.literal("connectors"),
  command: z.union([
    z.literal("stop"),
    z.literal("delete"),
    z.literal("pause"),
    z.literal("unpause"),
    z.literal("resume"),
    z.literal("full-resync"),
    z.literal("set-error"),
    z.literal("clear-error"),
    z.literal("restart"),
    z.literal("get-parents"),
    z.literal("set-permission"),
    z.literal("garbage-collect"),
  ]),
  args: cliArgs,
});
export type ConnectorsCommandType = z.infer<typeof ConnectorsCommandSchema>;
/**
 * </Connectors>
 */

/**
 * <Confluence>
 */
export const ConfluenceCommandSchema = z.object({
  majorCommand: z.literal("confluence"),
  command: z.union([
    z.literal("check-page-exists"),
    z.literal("check-space-access"),
    z.literal("ignore-near-rate-limit"),
    z.literal("me"),
    z.literal("resolve-space-from-url"),
    z.literal("skip-page"),
    z.literal("sync-space"),
    z.literal("unignore-near-rate-limit"),
    z.literal("update-parents"),
    z.literal("upsert-page"),
    z.literal("upsert-pages"),
  ]),
  args: z.object({
    connectorId: z.number().optional(),
    pageId: z.number().optional(),
    spaceId: z.number().optional(),
    file: z.string().optional(),
    keyInFile: z.string().optional(),
    url: z.string().optional(),
    forceUpsert: z.literal("true").optional(),
    skipFetch: z.literal("true").optional(),
    skipReason: z.string().optional(),
  }),
});
export type ConfluenceCommandType = z.infer<typeof ConfluenceCommandSchema>;

export const ConfluenceMeResponseSchema = z.object({
  me: z.record(z.string(), z.unknown()),
});
export type ConfluenceMeResponseType = z.infer<
  typeof ConfluenceMeResponseSchema
>;

export const ConfluenceUpsertPageResponseSchema = z.object({
  workflowId: z.string(),
  workflowUrl: z.string().optional(),
});
export type ConfluenceUpsertPageResponseType = z.infer<
  typeof ConfluenceUpsertPageResponseSchema
>;

export const ConfluenceSkipPageResponseSchema = z.object({
  skipped: z.boolean(),
  reason: z.string().optional(),
});
export type ConfluenceSkipPageResponseType = z.infer<
  typeof ConfluenceSkipPageResponseSchema
>;

export const ConfluenceCheckSpaceAccessResponseSchema = z.object({
  hasAccess: z.boolean(),
  space: z.record(z.string(), z.unknown()),
});
export type ConfluenceCheckSpaceAccessResponseType = z.infer<
  typeof ConfluenceCheckSpaceAccessResponseSchema
>;

export const ConfluenceResolveSpaceFromUrlResponseSchema = z.object({
  found: z.boolean(),
  spaceId: z.string().optional(),
  spaceKey: z.string().optional(),
  spaceName: z.string().optional(),
  hasAccess: z.boolean().optional(),
  lastSyncedAt: z.string().optional(),
  pageCount: z.number().optional(),
});
export type ConfluenceResolveSpaceFromUrlResponseType = z.infer<
  typeof ConfluenceResolveSpaceFromUrlResponseSchema
>;

const ConfluenceAncestorSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string().optional(),
});
export type ConfluenceAncestorType = z.infer<typeof ConfluenceAncestorSchema>;

export const ConfluenceCheckPageExistsResponseSchema = z.discriminatedUnion(
  "exists",
  [
    z.object({ exists: z.literal(false) }),
    z.object({
      exists: z.literal(true),
      ancestors: z.array(ConfluenceAncestorSchema),
      existsInDust: z.boolean(),
      hasChildren: z.boolean(),
      hasReadRestrictions: z.boolean(),
      status: z.string(),
      title: z.string(),
    }),
  ]
);
export type ConfluenceCheckPageExistsResponseType = z.infer<
  typeof ConfluenceCheckPageExistsResponseSchema
>;
/**
 * </Confluence>
 */

/**
 * <Batch>
 */
export const BatchCommandSchema = z.object({
  majorCommand: z.literal("batch"),
  command: z.union([
    z.literal("full-resync"),
    z.literal("restart-all"),
    z.literal("stop-all"),
    z.literal("resume-all"),
  ]),
  args: cliArgs,
});
export type BatchCommandType = z.infer<typeof BatchCommandSchema>;

export const BatchAllResponseSchema = z.object({
  succeeded: z.number(),
  failed: z.number(),
});
export type BatchAllResponseType = z.infer<typeof BatchAllResponseSchema>;
/**
 * </Batch>
 */

/**
 * <GitHub>
 */
export const GithubCommandSchema = z.object({
  majorCommand: z.literal("github"),
  command: z.union([
    z.literal("resync-repo"),
    z.literal("resync-repo-code"),
    z.literal("code-sync"),
    z.literal("sync-issue"),
    z.literal("force-daily-code-sync"),
    z.literal("skip-issue"),
    z.literal("skip-repo"),
    z.literal("unskip-repo"),
    z.literal("list-skipped-repos"),
    z.literal("skip-code-file"),
    z.literal("unskip-code-file"),
    z.literal("clear-installation-id"),
  ]),
  args: cliArgs,
});
export type GithubCommandType = z.infer<typeof GithubCommandSchema>;
/**
 * </GitHub>
 */

/**
 * <Gong>
 */
export const GongCommandSchema = z.object({
  majorCommand: z.literal("gong"),
  command: z.union([z.literal("force-resync"), z.literal("delete-transcript")]),
  args: z.object({
    connectorId: z.number().optional(),
    fromTs: z.number().optional(),
    callId: z.string().optional(),
  }),
});
export type GongCommandType = z.infer<typeof GongCommandSchema>;

export const GongForceResyncResponseSchema = z.object({
  workflowId: z.string(),
  workflowUrl: z.string().optional(),
});
export type GongForceResyncResponseType = z.infer<
  typeof GongForceResyncResponseSchema
>;

export const GongDeleteTranscriptResponseSchema = z.object({
  callId: z.string(),
});
export type GongDeleteTranscriptResponseType = z.infer<
  typeof GongDeleteTranscriptResponseSchema
>;
/**
 * </Gong>
 */

/**
 * <GoogleDrive>
 */
export const GoogleDriveCommandSchema = z.object({
  majorCommand: z.literal("google_drive"),
  command: z.union([
    z.literal("garbage-collect-all"),
    z.literal("get-file-metadata"),
    z.literal("check-file"),
    z.literal("get-google-parents"),
    z.literal("clean-invalid-parents"),
    z.literal("upsert-file"),
    z.literal("update-core-parents"),
    z.literal("restart-google-webhooks"),
    z.literal("start-full-sync"),
    z.literal("start-incremental-sync"),
    z.literal("restart-all-incremental-sync-workflows"),
    z.literal("skip-file"),
    z.literal("register-webhook"),
    z.literal("register-all-webhooks"),
    z.literal("list-labels"),
    z.literal("export-folder-structure"),
  ]),
  args: cliArgs,
});
export type GoogleDriveCommandType = z.infer<typeof GoogleDriveCommandSchema>;

export const CheckFileGenericResponseSchema = z.object({
  status: z.number(),
  type: z.union([
    z.literal("undefined"),
    z.literal("object"),
    z.literal("boolean"),
    z.literal("number"),
    z.literal("string"),
    z.literal("function"),
    z.literal("symbol"),
    z.literal("bigint"),
  ]),
  content: z.unknown(),
});
export type CheckFileGenericResponseType = z.infer<
  typeof CheckFileGenericResponseSchema
>;
/**
 * </GoogleDrive>
 */

/**
 * <Intercom>
 */
export const IntercomCommandSchema = z.object({
  majorCommand: z.literal("intercom"),
  command: z.union([
    z.literal("force-resync-articles"),
    z.literal("force-resync-all-conversations"),
    z.literal("check-conversation"),
    z.literal("fetch-conversation"),
    z.literal("fetch-articles"),
    z.literal("check-missing-conversations"),
    z.literal("check-teams"),
    z.literal("set-conversations-sliding-window"),
    z.literal("get-conversations-sliding-window"),
    z.literal("search-conversations"),
    z.literal("restart-schedules"),
  ]),
  args: z.object({
    force: z.literal("true").optional(),
    connectorId: z.number().optional(),
    conversationId: z.number().optional(),
    day: z.string().optional(),
    helpCenterId: z.number().optional(),
    conversationsSlidingWindow: z.number().optional(),
    teamId: z.number().optional(),
    closedAfter: z.number().optional(),
    state: z.union([z.literal("open"), z.literal("closed")]).optional(),
    cursor: z.string().optional(),
    forceDeleteExisting: z.literal("true").optional(),
  }),
});
export type IntercomCommandType = z.infer<typeof IntercomCommandSchema>;

export const IntercomCheckConversationResponseSchema = z.object({
  isConversationOnIntercom: z.boolean(),
  isConversationOnDB: z.boolean(),
  conversationTeamIdOnIntercom: z.string().optional(),
  conversationTeamIdOnDB: z.string().nullable().optional(),
});
export type IntercomCheckConversationResponseType = z.infer<
  typeof IntercomCheckConversationResponseSchema
>;

export const IntercomFetchConversationResponseSchema = z.object({
  conversation: z.record(z.string(), z.unknown()).nullable(),
});
export type IntercomFetchConversationResponseType = z.infer<
  typeof IntercomFetchConversationResponseSchema
>;

export const IntercomFetchArticlesResponseSchema = z.object({
  articles: z.array(z.record(z.string(), z.unknown()).nullable()),
});
export type IntercomFetchArticlesResponseType = z.infer<
  typeof IntercomFetchArticlesResponseSchema
>;

export const IntercomCheckTeamsResponseSchema = z.object({
  teams: z.array(
    z.object({
      teamId: z.string(),
      name: z.string(),
      isTeamOnDB: z.boolean(),
    })
  ),
});
export type IntercomCheckTeamsResponseType = z.infer<
  typeof IntercomCheckTeamsResponseSchema
>;

export const IntercomCheckMissingConversationsResponseSchema = z.object({
  missingConversations: z.array(
    z.object({
      conversationId: z.string(),
      teamId: z.number().nullable(),
      open: z.boolean(),
      createdAt: z.number(),
    })
  ),
});
export type IntercomCheckMissingConversationsResponseType = z.infer<
  typeof IntercomCheckMissingConversationsResponseSchema
>;

export const IntercomForceResyncArticlesResponseSchema = z.object({
  affectedCount: z.number(),
});
export type IntercomForceResyncArticlesResponseType = z.infer<
  typeof IntercomForceResyncArticlesResponseSchema
>;

export const IntercomGetConversationsSlidingWindowResponseSchema = z.object({
  conversationsSlidingWindow: z.number(),
});
export type IntercomGetConversationsSlidingWindowResponseType = z.infer<
  typeof IntercomGetConversationsSlidingWindowResponseSchema
>;

export const IntercomSearchConversationsResponseSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.string(),
      open: z.boolean(),
      state: z.string(),
      created_at: z.number(),
      last_closed_at: z.number().nullable(),
    })
  ),
  totalCount: z.number(),
});
export type IntercomSearchConversationsResponseType = z.infer<
  typeof IntercomSearchConversationsResponseSchema
>;

export const IntercomForceResyncAllConversationsResponseSchema = z.object({
  workflowId: z.string(),
});
export type IntercomForceResyncAllConversationsResponseType = z.infer<
  typeof IntercomForceResyncAllConversationsResponseSchema
>;

export const IntercomRestartSchedulesResponseSchema = z.object({
  helpCenterScheduleId: z.string(),
  conversationScheduleId: z.string(),
});
export type IntercomRestartSchedulesResponseType = z.infer<
  typeof IntercomRestartSchedulesResponseSchema
>;

/**
 * </Intercom>
 */

/**
 * <Microsoft>
 */
export const MicrosoftCommandSchema = z.object({
  majorCommand: z.literal("microsoft"),
  command: z.union([
    z.literal("garbage-collect-all"),
    z.literal("check-file"),
    z.literal("start-full-sync"),
    z.literal("start-incremental-sync"),
    z.literal("restart-all-incremental-sync-workflows"),
    z.literal("skip-file"),
    z.literal("sync-node"),
    z.literal("get-parents"),
    z.literal("update-parent-in-node-table"),
    z.literal("update-core-parents"),
  ]),
  args: cliArgs,
});
export type MicrosoftCommandType = z.infer<typeof MicrosoftCommandSchema>;
/**
 * </Microsoft>
 */

/**
 * <Notion>
 */
export const NotionCommandSchema = z.object({
  majorCommand: z.literal("notion"),
  command: z.union([
    z.literal("skip-page"),
    z.literal("skip-database"),
    z.literal("upsert-page"),
    z.literal("upsert-database"),
    z.literal("search-pages"),
    z.literal("update-core-parents"),
    z.literal("check-url"),
    z.literal("find-url"),
    z.literal("delete-url"),
    z.literal("me"),
    z.literal("stop-all-garbage-collectors"),
    z.literal("update-parents-fields"),
    z.literal("clear-parents-last-updated-at"),
    z.literal("update-orphaned-resources-parents"),
    z.literal("api-request"),
  ]),
  args: cliArgs,
});
export type NotionCommandType = z.infer<typeof NotionCommandSchema>;

export const NotionUpsertResponseSchema = z.object({
  workflowId: z.string(),
  workflowUrl: z.string().optional(),
});
export type NotionUpsertResponseType = z.infer<
  typeof NotionUpsertResponseSchema
>;

export const NotionSearchPagesResponseSchema = z.object({
  pages: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      type: z.union([z.literal("page"), z.literal("database")]),
      isSkipped: z.boolean(),
      isFull: z.boolean(),
    })
  ),
});
export type NotionSearchPagesResponseType = z.infer<
  typeof NotionSearchPagesResponseSchema
>;

export const NotionCheckUrlResponseSchema = z.object({
  page: z.record(z.string(), z.unknown()).nullable(),
  db: z.record(z.string(), z.unknown()).nullable(),
});
export type NotionCheckUrlResponseType = z.infer<
  typeof NotionCheckUrlResponseSchema
>;

export const NotionDeleteUrlResponseSchema = z.object({
  deletedPage: z.boolean(),
  deletedDb: z.boolean(),
});
export type NotionDeleteUrlResponseType = z.infer<
  typeof NotionDeleteUrlResponseSchema
>;

export const NotionFindUrlResponseSchema = z.object({
  page: z.record(z.string(), z.unknown()).nullable(),
  db: z.record(z.string(), z.unknown()).nullable(),
});
export type NotionFindUrlResponseType = z.infer<
  typeof NotionFindUrlResponseSchema
>;

export const NotionMeResponseSchema = z.object({
  me: z.record(z.string(), z.unknown()),
  botOwner: z.record(z.string(), z.unknown()),
});
export type NotionMeResponseType = z.infer<typeof NotionMeResponseSchema>;

export const NotionApiRequestResponseSchema = z.object({
  status: z.number(),
  data: z.unknown(),
});
export type NotionApiRequestResponseType = z.infer<
  typeof NotionApiRequestResponseSchema
>;
/**
 * </Notion>
 */

/**
 * <Salesforce>
 */
export const SalesforceCommandSchema = z.object({
  majorCommand: z.literal("salesforce"),
  command: z.union([
    z.literal("check-connection"),
    z.literal("run-soql"),
    z.literal("setup-synced-query"),
    z.literal("sync-query"),
  ]),
  args: z.object({
    wId: z.string().optional(),
    dsId: z.string().optional(),
    soql: z.string().optional(),
    limit: z.number().optional(),
    lastModifiedDateOrder: z
      .union([z.literal("ASC"), z.literal("DESC")])
      .optional(),
    offset: z.number().optional(),
    rootNodeName: z.string().optional(),
    titleTemplate: z.string().optional(),
    contentTemplate: z.string().optional(),
    tagsTemplate: z.string().optional(),
    execute: z.boolean().optional(),
    queryId: z.number().optional(),
    full: z.boolean().optional(),
  }),
});
export type SalesforceCommandType = z.infer<typeof SalesforceCommandSchema>;

export const SalesforceCheckConnectionResponseSchema = z.object({
  ok: z.boolean(),
});
export type SalesforceCheckConnectionResponseType = z.infer<
  typeof SalesforceCheckConnectionResponseSchema
>;

export const SalesforceRunSoqlResponseSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())),
  totalSize: z.number(),
  done: z.boolean(),
});
export type SalesforceRunSoqlResponseType = z.infer<
  typeof SalesforceRunSoqlResponseSchema
>;

export const SalesforceSetupSyncedQueryResponseSchema = z.object({
  documents: z.array(
    z.object({
      id: z.string(),
      lastModifiedDate: z.string(),
      title: z.string(),
      content: z.string(),
      tags: z.array(z.string()),
    })
  ),
  queryId: z.number().nullable(),
  created: z.boolean(),
});
export type SalesforceSetupSyncedQueryResponseType = z.infer<
  typeof SalesforceSetupSyncedQueryResponseSchema
>;

export const SalesforceSyncQueryResponseSchema = z.object({
  workflowId: z.string(),
});
export type SalesforceSyncQueryResponseType = z.infer<
  typeof SalesforceSyncQueryResponseSchema
>;
/**
 * </Salesforce>
 */

/**
 * <Slack>
 */
export const SlackCommandSchema = z.object({
  majorCommand: z.literal("slack"),
  command: z.union([
    z.literal("add-channel-to-sync"),
    z.literal("cutover-legacy-bot"),
    z.literal("enable-bot"),
    z.literal("remove-channel-from-sync"),
    z.literal("skip-channel"),
    z.literal("skip-thread"),
    z.literal("sync-channel"),
    z.literal("sync-channel-metadata"),
    z.literal("sync-thread"),
    z.literal("uninstall-for-unknown-team-ids"),
    z.literal("unskip-channel"),
    z.literal("run-auto-join"),
    z.literal("whitelist-bot"),
    z.literal("whitelist-domains"),
    z.literal("check-channel"),
    z.literal("delete-conversation"),
  ]),
  args: cliArgs,
});
export type SlackCommandType = z.infer<typeof SlackCommandSchema>;

export const SlackJoinResponseSchema = z.object({
  total: z.number(),
  processed: z.number(),
});
export type SlackJoinResponseType = z.infer<typeof SlackJoinResponseSchema>;

export const SlackCheckChannelResponseSchema = z.object({
  success: z.literal(true),
  channel: z.object({
    name: z.string().optional(),
    isPrivate: z.boolean().optional(),
  }),
});
export type SlackCheckChannelResponseType = z.infer<
  typeof SlackCheckChannelResponseSchema
>;

/**
 * </Slack>
 */

/**
 * <Snowflake>
 */
export const SnowflakeCommandSchema = z.object({
  majorCommand: z.literal("snowflake"),
  command: z.union([
    z.literal("fetch-databases"),
    z.literal("fetch-schemas"),
    z.literal("fetch-tables"),
  ]),
  args: z.object({
    connectorId: z.number(),
    database: z.string().optional(),
    schema: z.string().optional(),
  }),
});
export type SnowflakeCommandType = z.infer<typeof SnowflakeCommandSchema>;

export const SnowflakeFetchDatabaseResponseSchema = z.array(
  z.object({ name: z.string() })
);
export type SnowflakeFetchDatabaseResponseType = z.infer<
  typeof SnowflakeFetchDatabaseResponseSchema
>;

export const SnowflakeFetchSchemaResponseSchema = z.array(
  z.object({
    name: z.string(),
    database_name: z.string(),
  })
);
export type SnowflakeFetchSchemaResponseType = z.infer<
  typeof SnowflakeFetchSchemaResponseSchema
>;

export const SnowflakeFetchTableResponseSchema = z.array(
  z.object({
    name: z.string(),
    database_name: z.string(),
    schema_name: z.string(),
  })
);
export type SnowflakeFetchTableResponseType = z.infer<
  typeof SnowflakeFetchTableResponseSchema
>;
/**
 * </Snowflake>
 */

/**
 * <Temporal>
 */
export const TemporalCommandSchema = z.object({
  majorCommand: z.literal("temporal"),
  command: z.union([
    z.literal("check-queue"),
    z.literal("find-unprocessed-workflows"),
    z.literal("stop-workflow"),
  ]),
  args: cliArgs,
});
export type TemporalCommandType = z.infer<typeof TemporalCommandSchema>;

export const TemporalCheckQueueResponseSchema = z.object({
  taskQueue: z.record(z.string(), z.unknown()),
});
export type TemporalCheckQueueResponseType = z.infer<
  typeof TemporalCheckQueueResponseSchema
>;

export const TemporalStopWorkflowResponseSchema = z.object({
  workflowId: z.string(),
  terminated: z.boolean(),
});
export type TemporalStopWorkflowResponseType = z.infer<
  typeof TemporalStopWorkflowResponseSchema
>;

export const TemporalUnprocessedWorkflowsResponseSchema = z.object({
  queuesAndPollers: z.array(
    z.object({ queue: z.string(), pollers: z.number() })
  ),
  unprocessedQueues: z.array(z.string()),
});
export type TemporalUnprocessedWorkflowsResponseType = z.infer<
  typeof TemporalUnprocessedWorkflowsResponseSchema
>;
/**
 * </Temporal>
 */

/**
 * <Webcrawler>
 */
export const WebcrawlerCommandSchema = z.object({
  majorCommand: z.literal("webcrawler"),
  command: z.union([
    z.literal("start-scheduler"),
    z.literal("update-frequency"),
    z.literal("set-actions"),
  ]),
  args: z.record(z.string(), z.string()),
});
export type WebcrawlerCommandType = z.infer<typeof WebcrawlerCommandSchema>;
/**
 * </Webcrawler>
 */

/**
 * <Zendesk>
 */
export const ZendeskCommandSchema = z.object({
  majorCommand: z.literal("zendesk"),
  command: z.union([
    z.literal("check-is-admin"),
    z.literal("count-tickets"),
    z.literal("resync-tickets"),
    z.literal("fetch-ticket"),
    z.literal("fetch-brand"),
    z.literal("resync-help-centers"),
    z.literal("resync-brand-metadata"),
    z.literal("sync-ticket"),
    z.literal("get-retention-period"),
    z.literal("set-retention-period"),
    z.literal("add-organization-tag"),
    z.literal("remove-organization-tag"),
    z.literal("add-ticket-tag"),
    z.literal("remove-ticket-tag"),
    z.literal("set-rate-limit"),
  ]),
  args: z.object({
    wId: z.string().optional(),
    dsId: z.string().optional(),
    connectorId: z.number().optional(),
    brandId: z.number().nullable().optional(),
    query: z.string().optional(),
    forceResync: z.literal("true").optional(),
    ticketId: z.number().optional(),
    ticketUrl: z.string().optional(),
    retentionPeriodDays: z.number().optional(),
    rateLimitTps: z.number().optional(),
    tag: z.string().optional(),
    include: z.literal("true").optional(),
    exclude: z.literal("true").optional(),
  }),
});
export type ZendeskCommandType = z.infer<typeof ZendeskCommandSchema>;

export const ZendeskCheckIsAdminResponseSchema = z.object({
  userRole: z.string(),
  userActive: z.boolean(),
  userIsAdmin: z.boolean(),
});
export type ZendeskCheckIsAdminResponseType = z.infer<
  typeof ZendeskCheckIsAdminResponseSchema
>;

export const ZendeskCountTicketsResponseSchema = z.object({
  ticketCount: z.number(),
});
export type ZendeskCountTicketsResponseType = z.infer<
  typeof ZendeskCountTicketsResponseSchema
>;

export const ZendeskFetchTicketResponseSchema = z.object({
  ticket: z.record(z.string(), z.unknown()).nullable(),
  shouldSyncTicket: z.object({
    shouldSync: z.boolean(),
    reason: z.string().nullable(),
  }),
  isTicketOnDb: z.boolean(),
});
export type ZendeskFetchTicketResponseType = z.infer<
  typeof ZendeskFetchTicketResponseSchema
>;

export const ZendeskFetchBrandResponseSchema = z.object({
  brand: z.record(z.string(), z.unknown()).nullable(),
  brandOnDb: z.record(z.string(), z.unknown()).nullable(),
});
export type ZendeskFetchBrandResponseType = z.infer<
  typeof ZendeskFetchBrandResponseSchema
>;

export const ZendeskGetRetentionPeriodResponseSchema = z.object({
  retentionPeriodDays: z.number(),
});
export type ZendeskGetRetentionPeriodResponseType = z.infer<
  typeof ZendeskGetRetentionPeriodResponseSchema
>;

export const ZendeskOrganizationTagResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});
export type ZendeskOrganizationTagResponseType = z.infer<
  typeof ZendeskOrganizationTagResponseSchema
>;
/**
 * </Zendesk>
 */

/**
 * <Admin>
 */
export const AdminCommandSchema = z.discriminatedUnion("majorCommand", [
  BatchCommandSchema,
  ConfluenceCommandSchema,
  ConnectorsCommandSchema,
  GithubCommandSchema,
  GongCommandSchema,
  GoogleDriveCommandSchema,
  IntercomCommandSchema,
  MicrosoftCommandSchema,
  NotionCommandSchema,
  SalesforceCommandSchema,
  SlackCommandSchema,
  SnowflakeCommandSchema,
  TemporalCommandSchema,
  WebcrawlerCommandSchema,
  ZendeskCommandSchema,
]);
export type AdminCommandType = z.infer<typeof AdminCommandSchema>;

export const AdminSuccessResponseSchema = z.object({
  success: z.literal(true),
});
export type AdminSuccessResponseType = z.infer<
  typeof AdminSuccessResponseSchema
>;

export const AdminResponseSchema = z.union([
  AdminSuccessResponseSchema,
  BatchAllResponseSchema,
  CheckFileGenericResponseSchema,
  ConfluenceCheckPageExistsResponseSchema,
  ConfluenceCheckSpaceAccessResponseSchema,
  ConfluenceMeResponseSchema,
  ConfluenceResolveSpaceFromUrlResponseSchema,
  ConfluenceSkipPageResponseSchema,
  ConfluenceUpsertPageResponseSchema,
  GongDeleteTranscriptResponseSchema,
  GongForceResyncResponseSchema,
  IntercomCheckConversationResponseSchema,
  IntercomCheckMissingConversationsResponseSchema,
  IntercomCheckTeamsResponseSchema,
  IntercomFetchArticlesResponseSchema,
  IntercomFetchConversationResponseSchema,
  IntercomForceResyncArticlesResponseSchema,
  IntercomGetConversationsSlidingWindowResponseSchema,
  IntercomRestartSchedulesResponseSchema,
  IntercomSearchConversationsResponseSchema,
  NotionApiRequestResponseSchema,
  NotionCheckUrlResponseSchema,
  NotionDeleteUrlResponseSchema,
  NotionMeResponseSchema,
  NotionSearchPagesResponseSchema,
  NotionUpsertResponseSchema,
  SlackCheckChannelResponseSchema,
  SlackJoinResponseSchema,
  SalesforceCheckConnectionResponseSchema,
  SalesforceRunSoqlResponseSchema,
  SalesforceSetupSyncedQueryResponseSchema,
  SalesforceSyncQueryResponseSchema,
  SnowflakeFetchDatabaseResponseSchema,
  SnowflakeFetchSchemaResponseSchema,
  SnowflakeFetchTableResponseSchema,
  TemporalCheckQueueResponseSchema,
  TemporalStopWorkflowResponseSchema,
  TemporalUnprocessedWorkflowsResponseSchema,
  ZendeskCheckIsAdminResponseSchema,
  ZendeskCountTicketsResponseSchema,
  ZendeskFetchBrandResponseSchema,
  ZendeskFetchTicketResponseSchema,
  ZendeskGetRetentionPeriodResponseSchema,
  ZendeskOrganizationTagResponseSchema,
]);
export type AdminResponseType = z.infer<typeof AdminResponseSchema>;
/**
 * </Admin>
 */
