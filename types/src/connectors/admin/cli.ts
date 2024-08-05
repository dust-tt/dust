import * as t from "io-ts";

export const ConnectorsCommandSchema = t.type({
  majorCommand: t.literal("connectors"),
  command: t.union([
    t.literal("stop"),
    t.literal("delete"),
    t.literal("resume"),
    t.literal("full-resync"),
    t.literal("set-error"),
    t.literal("restart"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type ConnectorsCommandType = t.TypeOf<typeof ConnectorsCommandSchema>;

export const GithubCommandSchema = t.type({
  majorCommand: t.literal("github"),
  command: t.union([
    t.literal("resync-repo"),
    t.literal("code-sync"),
    t.literal("sync-issue"),
    t.literal("force-daily-code-sync"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type GithubCommandType = t.TypeOf<typeof GithubCommandSchema>;

export const NotionCommandSchema = t.type({
  majorCommand: t.literal("notion"),
  command: t.union([
    t.literal("restart-all"),
    t.literal("skip-page"),
    t.literal("skip-database"),
    t.literal("upsert-page"),
    t.literal("upsert-database"),
    t.literal("search-pages"),
    t.literal("check-url"),
    t.literal("find-url"),
    t.literal("me"),
    t.literal("stop-all-garbage-collectors"),
    t.literal("update-parents-fields"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type NotionCommandType = t.TypeOf<typeof NotionCommandSchema>;

export const GoogleDriveCommandSchema = t.type({
  majorCommand: t.literal("google_drive"),
  command: t.union([
    t.literal("garbage-collect-all"),
    t.literal("check-file"),
    t.literal("restart-google-webhooks"),
    t.literal("start-incremental-sync"),
    t.literal("restart-all-incremental-sync-workflows"),
    t.literal("skip-file"),
    t.literal("register-webhook"),
    t.literal("register-all-webhooks"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type GoogleDriveCommandType = t.TypeOf<typeof GoogleDriveCommandSchema>;

export const SlackCommandSchema = t.type({
  majorCommand: t.literal("slack"),
  command: t.union([
    t.literal("enable-bot"),
    t.literal("sync-channel"),
    t.literal("sync-thread"),
    t.literal("uninstall-for-unknown-team-ids"),
    t.literal("whitelist-domains"),
    t.literal("whitelist-bot"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type SlackCommandType = t.TypeOf<typeof SlackCommandSchema>;

export const BatchCommandSchema = t.type({
  majorCommand: t.literal("batch"),
  command: t.union([t.literal("full-resync"), t.literal("restart-all")]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type BatchCommandType = t.TypeOf<typeof BatchCommandSchema>;

export const WebcrawlerCommandSchema = t.type({
  majorCommand: t.literal("webcrawler"),
  command: t.literal("start-scheduler"),
});

export const BatchRestartAllResponseSchema = t.type({
  succeeded: t.number,
  failed: t.number,
});
export type BatchRestartAllResponseType = t.TypeOf<
  typeof BatchRestartAllResponseSchema
>;

export type WebcrawlerCommandType = t.TypeOf<typeof WebcrawlerCommandSchema>;

export const TemporalCommandSchema = t.type({
  majorCommand: t.literal("temporal"),
  command: t.union([
    t.literal("find-unprocessed-workflows"),
    t.literal("check-queue"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type TemporalCommandType = t.TypeOf<typeof TemporalCommandSchema>;

/**
 * <Intercom>
 */
export const IntercomCommandSchema = t.type({
  majorCommand: t.literal("intercom"),
  command: t.union([
    t.literal("check-conversation"),
    t.literal("fetch-conversation"),
    t.literal("check-missing-conversations"),
    t.literal("check-teams"),
  ]),
  args: t.type({
    connectorId: t.number,
    conversationId: t.union([t.number, t.undefined]),
    day: t.union([t.string, t.undefined]),
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
/**
 * </ Intercom>
 */

export const MicrosoftCommandSchema = t.type({
  majorCommand: t.literal("microsoft"),
  command: t.union([
    t.literal("garbage-collect-all"),
    t.literal("check-file"),
    t.literal("start-incremental-sync"),
    t.literal("restart-all-incremental-sync-workflows"),
    t.literal("skip-file"),
  ]),
  args: t.record(t.string, t.union([t.string, t.undefined])),
});

export type MicrosoftCommandType = t.TypeOf<typeof MicrosoftCommandSchema>;

export const MicrosoftCheckFileResponseSchema = t.type({
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
  content: t.unknown, // google drive type, can't be iots'd
});

export type MicrosoftCheckFileResponseType = t.TypeOf<
  typeof MicrosoftCheckFileResponseSchema
>;

export const AdminCommandSchema = t.union([
  ConnectorsCommandSchema,
  GithubCommandSchema,
  NotionCommandSchema,
  GoogleDriveCommandSchema,
  SlackCommandSchema,
  BatchCommandSchema,
  WebcrawlerCommandSchema,
  TemporalCommandSchema,
  IntercomCommandSchema,
  MicrosoftCommandSchema,
]);

export type AdminCommandType = t.TypeOf<typeof AdminCommandSchema>;

export const AdminSuccessResponseSchema = t.type({
  success: t.literal(true),
});

export type AdminSuccessResponseType = t.TypeOf<
  typeof AdminSuccessResponseSchema
>;

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

export const GoogleDriveCheckFileResponseSchema = t.type({
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
  content: t.unknown, // google drive type, can't be iots'd
});

export type GoogleDriveCheckFileResponseType = t.TypeOf<
  typeof GoogleDriveCheckFileResponseSchema
>;

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

export const AdminResponseSchema = t.union([
  AdminSuccessResponseSchema,
  BatchRestartAllResponseSchema,
  NotionUpsertResponseSchema,
  NotionSearchPagesResponseSchema,
  NotionCheckUrlResponseSchema,
  NotionMeResponseSchema,
  GoogleDriveCheckFileResponseSchema,
  TemporalCheckQueueResponseSchema,
  TemporalUnprocessedWorkflowsResponseSchema,
  IntercomCheckConversationResponseSchema,
  IntercomFetchConversationResponseSchema,
  IntercomCheckTeamsResponseSchema,
  IntercomCheckMissingConversationsResponseSchema,
]);

export type AdminResponseType = t.TypeOf<typeof AdminResponseSchema>;
