import * as t from "io-ts";

import { NumberAsStringCodec } from "../../shared/utils/iots_utils";

/**
 * <Connectors>
 */
export const ConnectorsCommandSchema = t.type({
  majorCommand: t.literal("connectors"),
  command: t.union([
    t.literal("stop"),
    t.literal("delete"),
    t.literal("pause"),
    t.literal("unpause"),
    t.literal("resume"),
    t.literal("full-resync"),
    t.literal("set-error"),
    t.literal("clear-error"),
    t.literal("restart"),
    t.literal("get-parents"),
    t.literal("set-permission"),
    t.literal("garbage-collect"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type ConnectorsCommandType = t.TypeOf<typeof ConnectorsCommandSchema>;
/**
 * </Connectors>
 */

/**
 * <Confluence>
 */
export const ConfluenceCommandSchema = t.type({
  majorCommand: t.literal("confluence"),
  command: t.union([
    t.literal("check-page-exists"),
    t.literal("check-space-access"),
    t.literal("ignore-near-rate-limit"),
    t.literal("me"),
    t.literal("resolve-space-from-url"),
    t.literal("skip-page"),
    t.literal("sync-space"),
    t.literal("unignore-near-rate-limit"),
    t.literal("update-parents"),
    t.literal("upsert-page"),
    t.literal("upsert-pages"),
  ]),
  args: t.type({
    connectorId: t.union([t.number, t.undefined]),
    pageId: t.union([t.number, t.undefined]),
    spaceId: t.union([t.number, t.undefined]),
    file: t.union([t.string, t.undefined]),
    keyInFile: t.union([t.string, t.undefined]),
    url: t.union([t.string, t.undefined]),
    forceUpsert: t.union([t.literal("true"), t.undefined]),
    skipReason: t.union([t.string, t.undefined]),
  }),
});
export type ConfluenceCommandType = t.TypeOf<typeof ConfluenceCommandSchema>;

export const ConfluenceMeResponseSchema = t.type({
  me: t.UnknownRecord,
});
export type ConfluenceMeResponseType = t.TypeOf<
  typeof ConfluenceMeResponseSchema
>;

export const ConfluenceUpsertPageResponseSchema = t.type({
  workflowId: t.string,
  workflowUrl: t.union([t.string, t.undefined]),
});
export type ConfluenceUpsertPageResponseType = t.TypeOf<
  typeof ConfluenceUpsertPageResponseSchema
>;

export const ConfluenceSkipPageResponseSchema = t.type({
  skipped: t.boolean,
  reason: t.union([t.string, t.undefined]),
});
export type ConfluenceSkipPageResponseType = t.TypeOf<
  typeof ConfluenceSkipPageResponseSchema
>;

export const ConfluenceCheckSpaceAccessResponseSchema = t.type({
  hasAccess: t.boolean,
  space: t.UnknownRecord,
});
export type ConfluenceCheckSpaceAccessResponseType = t.TypeOf<
  typeof ConfluenceCheckSpaceAccessResponseSchema
>;

export const ConfluenceResolveSpaceFromUrlResponseSchema = t.intersection([
  t.type({
    found: t.boolean,
  }),
  t.partial({
    spaceId: t.string,
    spaceKey: t.string,
    spaceName: t.string,
    hasAccess: t.boolean,
    lastSyncedAt: t.string,
    pageCount: t.number,
  }),
]);
export type ConfluenceResolveSpaceFromUrlResponseType = t.TypeOf<
  typeof ConfluenceResolveSpaceFromUrlResponseSchema
>;

const ConfluenceAncestorSchema = t.type({
  id: t.string,
  type: t.string,
  title: t.union([t.undefined, t.string]),
});
export type ConfluenceAncestorType = t.TypeOf<typeof ConfluenceAncestorSchema>;

export const ConfluenceCheckPageExistsResponseSchema = t.union([
  t.type({
    exists: t.literal(false),
  }),
  t.type({
    exists: t.literal(true),
    ancestors: t.array(ConfluenceAncestorSchema),
    existsInDust: t.boolean,
    hasChildren: t.boolean,
    hasReadRestrictions: t.boolean,
    status: t.string,
    title: t.string,
  }),
]);
export type ConfluenceCheckPageExistsResponseType = t.TypeOf<
  typeof ConfluenceCheckPageExistsResponseSchema
>;
/**
 * </Confluence>
 */

/**
 * <Batch>
 */
export const BatchCommandSchema = t.type({
  majorCommand: t.literal("batch"),
  command: t.union([
    t.literal("full-resync"),
    t.literal("restart-all"),
    t.literal("stop-all"),
    t.literal("resume-all"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type BatchCommandType = t.TypeOf<typeof BatchCommandSchema>;

export const BatchAllResponseSchema = t.type({
  succeeded: t.number,
  failed: t.number,
});
export type BatchAllResponseType = t.TypeOf<typeof BatchAllResponseSchema>;
/**
 * </Batch>
 */

/**
 * <GitHub>
 */
export const GithubCommandSchema = t.type({
  majorCommand: t.literal("github"),
  command: t.union([
    t.literal("resync-repo"),
    t.literal("resync-repo-code"),
    t.literal("code-sync"),
    t.literal("sync-issue"),
    t.literal("force-daily-code-sync"),
    t.literal("skip-issue"),
    t.literal("skip-repo"),
    t.literal("unskip-repo"),
    t.literal("list-skipped-repos"),
    t.literal("skip-code-file"),
    t.literal("unskip-code-file"),
    t.literal("clear-installation-id"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type GithubCommandType = t.TypeOf<typeof GithubCommandSchema>;
/**
 * </GitHub>
 */

/**
 * <Gong>
 */
export const GongCommandSchema = t.type({
  majorCommand: t.literal("gong"),
  command: t.literal("force-resync"),
  args: t.type({
    connectorId: t.union([t.number, t.undefined]),
    fromTs: t.union([t.number, t.undefined]),
  }),
});
export type GongCommandType = t.TypeOf<typeof GongCommandSchema>;

export const GongForceResyncResponseSchema = t.type({
  workflowId: t.string,
  workflowUrl: t.union([t.string, t.undefined]),
});
export type GongForceResyncResponseType = t.TypeOf<
  typeof GongForceResyncResponseSchema
>;
/**
 * </Gong>
 */

/**
 * <GoogleDrive>
 */
export const GoogleDriveCommandSchema = t.type({
  majorCommand: t.literal("google_drive"),
  command: t.union([
    t.literal("garbage-collect-all"),
    t.literal("get-file"),
    t.literal("check-file"),
    t.literal("get-google-parents"),
    t.literal("clean-invalid-parents"),
    t.literal("upsert-file"),
    t.literal("update-core-parents"),
    t.literal("restart-google-webhooks"),
    t.literal("start-incremental-sync"),
    t.literal("restart-all-incremental-sync-workflows"),
    t.literal("skip-file"),
    t.literal("register-webhook"),
    t.literal("register-all-webhooks"),
    t.literal("list-labels"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type GoogleDriveCommandType = t.TypeOf<typeof GoogleDriveCommandSchema>;

export const CheckFileGenericResponseSchema = t.type({
  status: t.number,
  // all literals from js `typeof`
  type: t.union([
    t.literal("undefined"),
    t.literal("object"),
    t.literal("boolean"),
    t.literal("number"),
    t.literal("string"),
    t.literal("function"),
    t.literal("symbol"),
    t.literal("bigint"),
  ]),
  content: t.unknown, // Google Drive type, can't be iots'd
});
export type CheckFileGenericResponseType = t.TypeOf<
  typeof CheckFileGenericResponseSchema
>;
/**
 * </GoogleDrive>
 */

/**
 * <Intercom>
 */
export const IntercomCommandSchema = t.type({
  majorCommand: t.literal("intercom"),
  command: t.union([
    t.literal("force-resync-articles"),
    t.literal("check-conversation"),
    t.literal("fetch-conversation"),
    t.literal("fetch-articles"),
    t.literal("check-missing-conversations"),
    t.literal("check-teams"),
    t.literal("set-conversations-sliding-window"),
  ]),
  args: t.type({
    force: t.union([t.literal("true"), t.undefined]),
    connectorId: t.union([t.number, t.undefined]),
    conversationId: t.union([t.number, t.undefined]),
    day: t.union([t.string, t.undefined]),
    helpCenterId: t.union([t.number, t.undefined]),
    conversationsSlidingWindow: t.union([t.number, t.undefined]),
  }),
});
export type IntercomCommandType = t.TypeOf<typeof IntercomCommandSchema>;

export const IntercomCheckConversationResponseSchema = t.type({
  isConversationOnIntercom: t.boolean,
  isConversationOnDB: t.boolean,
  conversationTeamIdOnIntercom: t.union([t.string, t.undefined]),
  conversationTeamIdOnDB: t.union([t.string, t.undefined, t.null]),
});
export type IntercomCheckConversationResponseType = t.TypeOf<
  typeof IntercomCheckConversationResponseSchema
>;

export const IntercomFetchConversationResponseSchema = t.type({
  conversation: t.union([t.UnknownRecord, t.null]), // intercom type, can't be iots'd
});
export type IntercomFetchConversationResponseType = t.TypeOf<
  typeof IntercomFetchConversationResponseSchema
>;

export const IntercomFetchArticlesResponseSchema = t.type({
  articles: t.array(t.union([t.UnknownRecord, t.null])), // intercom type, can't be iots'd
});
export type IntercomFetchArticlesResponseType = t.TypeOf<
  typeof IntercomFetchArticlesResponseSchema
>;

export const IntercomCheckTeamsResponseSchema = t.type({
  teams: t.array(
    t.type({
      teamId: t.string,
      name: t.string,
      isTeamOnDB: t.boolean,
    })
  ),
});
export type IntercomCheckTeamsResponseType = t.TypeOf<
  typeof IntercomCheckTeamsResponseSchema
>;

export const IntercomCheckMissingConversationsResponseSchema = t.type({
  missingConversations: t.array(
    t.type({
      conversationId: t.string,
      teamId: t.union([t.number, t.null]),
      open: t.boolean,
      createdAt: t.number,
    })
  ),
});
export type IntercomCheckMissingConversationsResponseType = t.TypeOf<
  typeof IntercomCheckMissingConversationsResponseSchema
>;

export const IntercomForceResyncArticlesResponseSchema = t.type({
  affectedCount: t.number,
});
export type IntercomForceResyncArticlesResponseType = t.TypeOf<
  typeof IntercomForceResyncArticlesResponseSchema
>;
/**
 * </ Intercom>
 */

/**
 * <Microsoft>
 */
export const MicrosoftCommandSchema = t.type({
  majorCommand: t.literal("microsoft"),
  command: t.union([
    t.literal("garbage-collect-all"),
    t.literal("check-file"),
    t.literal("start-incremental-sync"),
    t.literal("restart-all-incremental-sync-workflows"),
    t.literal("skip-file"),
    t.literal("sync-node"),
    t.literal("get-parents"),
    t.literal("update-parent-in-node-table"),
    t.literal("update-core-parents"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type MicrosoftCommandType = t.TypeOf<typeof MicrosoftCommandSchema>;
/**
 * </Microsoft>
 */

/**
 * <Notion>
 */
export const NotionCommandSchema = t.type({
  majorCommand: t.literal("notion"),
  command: t.union([
    t.literal("skip-page"),
    t.literal("skip-database"),
    t.literal("upsert-page"),
    t.literal("upsert-database"),
    t.literal("search-pages"),
    t.literal("update-core-parents"),
    t.literal("check-url"),
    t.literal("find-url"),
    t.literal("delete-url"),
    t.literal("me"),
    t.literal("stop-all-garbage-collectors"),
    t.literal("update-parents-fields"),
    t.literal("clear-parents-last-updated-at"),
    t.literal("update-orphaned-resources-parents"),
    t.literal("api-request"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type NotionCommandType = t.TypeOf<typeof NotionCommandSchema>;

export const NotionUpsertResponseSchema = t.type({
  workflowId: t.string,
  workflowUrl: t.union([t.string, t.undefined]),
});
export type NotionUpsertResponseType = t.TypeOf<
  typeof NotionUpsertResponseSchema
>;

export const NotionSearchPagesResponseSchema = t.type({
  pages: t.array(
    t.type({
      id: t.string,
      title: t.union([t.string, t.undefined]),
      type: t.union([t.literal("page"), t.literal("database")]),
      isSkipped: t.boolean,
      isFull: t.boolean,
    })
  ),
});
export type NotionSearchPagesResponseType = t.TypeOf<
  typeof NotionSearchPagesResponseSchema
>;

export const NotionCheckUrlResponseSchema = t.type({
  page: t.union([t.UnknownRecord, t.null]), // notion type, can't be iots'd
  db: t.union([t.UnknownRecord, t.null]), // notion type, can't be iots'd
});
export type NotionCheckUrlResponseType = t.TypeOf<
  typeof NotionCheckUrlResponseSchema
>;

export const NotionDeleteUrlResponseSchema = t.type({
  deletedPage: t.boolean,
  deletedDb: t.boolean,
});
export type NotionDeleteUrlResponseType = t.TypeOf<
  typeof NotionDeleteUrlResponseSchema
>;

export const NotionFindUrlResponseSchema = t.type({
  page: t.union([t.UnknownRecord, t.null]), // notion type, can't be iots'd
  db: t.union([t.UnknownRecord, t.null]), // notion type, can't be iots'd
});
export type NotionFindUrlResponseType = t.TypeOf<
  typeof NotionFindUrlResponseSchema
>;

export const NotionMeResponseSchema = t.type({
  me: t.UnknownRecord, // notion type, can't be iots'd
  botOwner: t.UnknownRecord, // notion type, can't be iots'd
});
export type NotionMeResponseType = t.TypeOf<typeof NotionMeResponseSchema>;

export const NotionApiRequestResponseSchema = t.type({
  status: t.number,
  data: t.unknown, // notion API response type, can't be iots'd
});
export type NotionApiRequestResponseType = t.TypeOf<
  typeof NotionApiRequestResponseSchema
>;
/**
 * </Notion>
 */

/**
 * <Salesforce>
 */
export const SalesforceCommandSchema = t.type({
  majorCommand: t.literal("salesforce"),
  command: t.union([
    t.literal("check-connection"),
    t.literal("run-soql"),
    t.literal("setup-synced-query"),
    t.literal("sync-query"),
  ]),
  args: t.type({
    wId: t.union([t.string, t.undefined]),
    dsId: t.union([t.string, t.undefined]),
    soql: t.union([t.string, t.undefined]),
    limit: t.union([t.number, t.undefined]),
    lastModifiedDateOrder: t.union([
      t.literal("ASC"),
      t.literal("DESC"),
      t.undefined,
    ]),
    offset: t.union([t.number, t.undefined]),
    rootNodeName: t.union([t.string, t.undefined]),
    titleTemplate: t.union([t.string, t.undefined]),
    contentTemplate: t.union([t.string, t.undefined]),
    tagsTemplate: t.union([t.string, t.undefined]),
    execute: t.union([t.boolean, t.undefined]),
    queryId: t.union([t.number, t.undefined]),
    full: t.union([t.boolean, t.undefined]),
  }),
});
export type SalesforceCommandType = t.TypeOf<typeof SalesforceCommandSchema>;

export const SalesforceCheckConnectionResponseSchema = t.type({
  ok: t.boolean,
});
export type SalesforceCheckConnectionResponseType = t.TypeOf<
  typeof SalesforceCheckConnectionResponseSchema
>;

export const SalesforceRunSoqlResponseSchema = t.type({
  records: t.array(t.UnknownRecord), // Salesforce type, can't be iots'd
  totalSize: t.number,
  done: t.boolean,
});
export type SalesforceRunSoqlResponseType = t.TypeOf<
  typeof SalesforceRunSoqlResponseSchema
>;

export const SalesforceSetupSyncedQueryResponseSchema = t.type({
  documents: t.array(
    t.type({
      id: t.string,
      lastModifiedDate: t.string,
      title: t.string,
      content: t.string,
      tags: t.array(t.string),
    })
  ),
  queryId: t.union([t.number, t.null]),
  created: t.boolean,
});
export type SalesforceSetupSyncedQueryResponseType = t.TypeOf<
  typeof SalesforceSetupSyncedQueryResponseSchema
>;

export const SalesforceSyncQueryResponseSchema = t.type({
  workflowId: t.string,
});
export type SalesforceSyncQueryResponseType = t.TypeOf<
  typeof SalesforceSyncQueryResponseSchema
>;
/**
 * </Salesforce>
 */

/**
 * <Slack>
 */
export const SlackCommandSchema = t.type({
  majorCommand: t.literal("slack"),
  command: t.union([
    t.literal("add-channel-to-sync"),
    t.literal("cutover-legacy-bot"),
    t.literal("enable-bot"),
    t.literal("remove-channel-from-sync"),
    t.literal("skip-channel"),
    t.literal("skip-thread"),
    t.literal("sync-channel"),
    t.literal("sync-channel-metadata"),
    t.literal("sync-thread"),
    t.literal("uninstall-for-unknown-team-ids"),
    t.literal("unskip-channel"),
    t.literal("whitelist-bot"),
    t.literal("run-auto-join"),
    t.literal("whitelist-domains"),
    t.literal("check-channel"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type SlackCommandType = t.TypeOf<typeof SlackCommandSchema>;

export const SlackJoinResponseSchema = t.type({
  total: t.number,
  processed: t.number,
});
export type SlackJoinResponseType = t.TypeOf<typeof SlackJoinResponseSchema>;
/**
 * </Slack>
 */

/**
 * <Snowflake>
 */
export const SnowflakeCommandSchema = t.type({
  majorCommand: t.literal("snowflake"),
  command: t.union([
    t.literal("fetch-databases"),
    t.literal("fetch-schemas"),
    t.literal("fetch-tables"),
  ]),
  args: t.type({
    connectorId: t.number,
    database: t.union([t.string, t.undefined]),
    schema: t.union([t.string, t.undefined]),
  }),
});
export type SnowflakeCommandType = t.TypeOf<typeof SnowflakeCommandSchema>;

export const SnowflakeFetchDatabaseResponseSchema = t.array(
  t.type({
    name: t.string,
  })
);
export type SnowflakeFetchDatabaseResponseType = t.TypeOf<
  typeof SnowflakeFetchDatabaseResponseSchema
>;

export const SnowflakeFetchSchemaResponseSchema = t.array(
  t.type({
    name: t.string,
    database_name: t.string,
  })
);
export type SnowflakeFetchSchemaResponseType = t.TypeOf<
  typeof SnowflakeFetchSchemaResponseSchema
>;

export const SnowflakeFetchTableResponseSchema = t.array(
  t.type({
    name: t.string,
    database_name: t.string,
    schema_name: t.string,
  })
);
export type SnowflakeFetchTableResponseType = t.TypeOf<
  typeof SnowflakeFetchTableResponseSchema
>;
/**
 * </Snowflake>
 */

/**
 * <Temporal>
 */
export const TemporalCommandSchema = t.type({
  majorCommand: t.literal("temporal"),
  command: t.union([
    t.literal("find-unprocessed-workflows"),
    t.literal("check-queue"),
  ]),
  args: t.record(
    t.string,
    t.union([t.string, NumberAsStringCodec, t.undefined])
  ),
});
export type TemporalCommandType = t.TypeOf<typeof TemporalCommandSchema>;

export const TemporalCheckQueueResponseSchema = t.type({
  taskQueue: t.UnknownRecord, // temporal type, can't be iots'd
});
export type TemporalCheckQueueResponseType = t.TypeOf<
  typeof TemporalCheckQueueResponseSchema
>;

export const TemporalUnprocessedWorkflowsResponseSchema = t.type({
  queuesAndPollers: t.array(t.type({ queue: t.string, pollers: t.number })),
  unprocessedQueues: t.array(t.string),
});
export type TemporalUnprocessedWorkflowsResponseType = t.TypeOf<
  typeof TemporalUnprocessedWorkflowsResponseSchema
>;
/**
 * </Temporal>
 */

/**
 * <Webcrawler>
 */
export const WebcrawlerCommandSchema = t.type({
  majorCommand: t.literal("webcrawler"),
  command: t.union([
    t.literal("start-scheduler"),
    t.literal("update-frequency"),
    t.literal("set-actions"),
  ]),
  args: t.record(t.string, t.string),
});
export type WebcrawlerCommandType = t.TypeOf<typeof WebcrawlerCommandSchema>;
/**
 * </Webcrawler>
 */

/**
 * <Zendesk>
 */
export const ZendeskCommandSchema = t.type({
  majorCommand: t.literal("zendesk"),
  command: t.union([
    t.literal("check-is-admin"),
    t.literal("count-tickets"),
    t.literal("resync-tickets"),
    t.literal("fetch-ticket"),
    t.literal("fetch-brand"),
    t.literal("resync-help-centers"),
    t.literal("resync-brand-metadata"),
    t.literal("sync-ticket"),
    t.literal("get-retention-period"),
    t.literal("set-retention-period"),
    t.literal("add-organization-tag"),
    t.literal("remove-organization-tag"),
    t.literal("add-ticket-tag"),
    t.literal("remove-ticket-tag"),
  ]),
  args: t.type({
    wId: t.union([t.string, t.undefined]),
    dsId: t.union([t.string, t.undefined]),
    connectorId: t.union([t.number, t.undefined]),
    brandId: t.union([t.number, t.null, t.undefined]),
    query: t.union([t.string, t.undefined]),
    forceResync: t.union([t.literal("true"), t.undefined]),
    ticketId: t.union([t.number, t.undefined]),
    ticketUrl: t.union([t.string, t.undefined]),
    retentionPeriodDays: t.union([t.number, t.undefined]),
    tag: t.union([t.string, t.undefined]),
    include: t.union([t.literal("true"), t.undefined]),
    exclude: t.union([t.literal("true"), t.undefined]),
  }),
});
export type ZendeskCommandType = t.TypeOf<typeof ZendeskCommandSchema>;

export const ZendeskCheckIsAdminResponseSchema = t.type({
  userRole: t.string,
  userActive: t.boolean,
  userIsAdmin: t.boolean,
});
export type ZendeskCheckIsAdminResponseType = t.TypeOf<
  typeof ZendeskCheckIsAdminResponseSchema
>;

export const ZendeskCountTicketsResponseSchema = t.type({
  ticketCount: t.number,
});
export type ZendeskCountTicketsResponseType = t.TypeOf<
  typeof ZendeskCountTicketsResponseSchema
>;

export const ZendeskFetchTicketResponseSchema = t.type({
  ticket: t.union([t.UnknownRecord, t.null]), // Zendesk type, can't be iots'd,
  shouldSyncTicket: t.type({
    shouldSync: t.boolean,
    reason: t.union([t.string, t.null]),
  }),
  isTicketOnDb: t.boolean,
});
export type ZendeskFetchTicketResponseType = t.TypeOf<
  typeof ZendeskFetchTicketResponseSchema
>;

export const ZendeskFetchBrandResponseSchema = t.type({
  brand: t.union([t.UnknownRecord, t.null]), // Zendesk type, can't be iots'd,
  brandOnDb: t.union([t.UnknownRecord, t.null]),
});
export type ZendeskFetchBrandResponseType = t.TypeOf<
  typeof ZendeskFetchBrandResponseSchema
>;

export const ZendeskGetRetentionPeriodResponseSchema = t.type({
  retentionPeriodDays: t.number,
});
export type ZendeskGetRetentionPeriodResponseType = t.TypeOf<
  typeof ZendeskGetRetentionPeriodResponseSchema
>;

export const ZendeskOrganizationTagResponseSchema = t.type({
  success: t.literal(true),
  message: t.union([t.string, t.undefined]),
});
export type ZendeskOrganizationTagResponseType = t.TypeOf<
  typeof ZendeskOrganizationTagResponseSchema
>;
/**
 * </Zendesk>
 */

/**
 * <Admin>
 */
export const AdminCommandSchema = t.union([
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
export type AdminCommandType = t.TypeOf<typeof AdminCommandSchema>;

export const AdminSuccessResponseSchema = t.type({
  success: t.literal(true),
});
export type AdminSuccessResponseType = t.TypeOf<
  typeof AdminSuccessResponseSchema
>;

export const AdminResponseSchema = t.union([
  AdminSuccessResponseSchema,
  BatchAllResponseSchema,
  CheckFileGenericResponseSchema,
  ConfluenceCheckPageExistsResponseSchema,
  ConfluenceCheckSpaceAccessResponseSchema,
  ConfluenceMeResponseSchema,
  ConfluenceResolveSpaceFromUrlResponseSchema,
  ConfluenceSkipPageResponseSchema,
  ConfluenceUpsertPageResponseSchema,
  GongForceResyncResponseSchema,
  IntercomCheckConversationResponseSchema,
  IntercomCheckMissingConversationsResponseSchema,
  IntercomCheckTeamsResponseSchema,
  IntercomFetchArticlesResponseSchema,
  IntercomFetchConversationResponseSchema,
  IntercomForceResyncArticlesResponseSchema,
  NotionApiRequestResponseSchema,
  NotionCheckUrlResponseSchema,
  NotionDeleteUrlResponseSchema,
  NotionMeResponseSchema,
  NotionSearchPagesResponseSchema,
  NotionUpsertResponseSchema,
  SalesforceCheckConnectionResponseSchema,
  SalesforceRunSoqlResponseSchema,
  SalesforceSetupSyncedQueryResponseSchema,
  SalesforceSyncQueryResponseSchema,
  SnowflakeFetchDatabaseResponseSchema,
  SnowflakeFetchSchemaResponseSchema,
  SnowflakeFetchTableResponseSchema,
  TemporalCheckQueueResponseSchema,
  TemporalUnprocessedWorkflowsResponseSchema,
  ZendeskCheckIsAdminResponseSchema,
  ZendeskCountTicketsResponseSchema,
  ZendeskFetchBrandResponseSchema,
  ZendeskFetchTicketResponseSchema,
  ZendeskGetRetentionPeriodResponseSchema,
  ZendeskOrganizationTagResponseSchema,
]);
export type AdminResponseType = t.TypeOf<typeof AdminResponseSchema>;
/**
 * </Admin>
 */
