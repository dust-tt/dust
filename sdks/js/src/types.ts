import moment from "moment-timezone";
import { z } from "zod";

const ModelProviderIdSchema = z.enum([
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
]);

const EmbeddingProviderIdSchema = z.enum(["openai", "mistral"]);

const ConnectorsAPIErrorTypeSchema = z.enum([
  "authorization_error",
  "not_found",
  "internal_server_error",
  "unexpected_error_format",
  "unexpected_response_format",
  "unexpected_network_error",
  "unknown_connector_provider",
  "invalid_request_error",
  "connector_not_found",
  "connector_configuration_not_found",
  "connector_update_error",
  "connector_update_unauthorized",
  "connector_oauth_target_mismatch",
  "connector_oauth_error",
  "slack_channel_not_found",
  "connector_rate_limit_error",
  "slack_configuration_not_found",
  "google_drive_webhook_not_found",
]);

const ConnectorsAPIErrorSchema = z.object({
  type: ConnectorsAPIErrorTypeSchema,
  message: z.string(),
});

const ModelIdSchema = z.number();

export type ConnectorsAPIErrorType = z.infer<
  typeof ConnectorsAPIErrorTypeSchema
>;

const SupportedContentFragmentTypeSchema = z.enum([
  ...([
    // Text content types.
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/comma-separated-values",
    "text/csv",
    "text/markdown",
    "text/plain",
    "text/tab-separated-values",
    "text/tsv",

    // Image content types.

    "image/jpeg",
    "image/png",

    // Legacy
    "dust-application/slack",
  ] as const),
]);

const UserMessageOriginSchema = z.union([
  z.enum([
    "slack",
    "web",
    "api",
    "gsheet",
    "zapier",
    "make",
    "zendesk",
    "raycast",
  ]),
  z.null(),
  z.undefined(),
]);

const RankSchema = z.object({
  rank: z.number(),
});

export class Ok<T> {
  constructor(public value: T) {}

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is Err<never> {
    return false;
  }
}

export class Err<E> {
  constructor(public error: E) {}

  isOk(): this is Ok<never> {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }
}

export type Result<T, E> = Ok<T> | Err<E>;

// Custom codec to validate the timezone
const Timezone = z.string().refine((s) => moment.tz.names().includes(s), {
  message: "Invalid timezone",
});

const ConnectorProvidersSchema = z.enum([
  "confluence",
  "github",
  "google_drive",
  "intercom",
  "notion",
  "slack",
  "microsoft",
  "webcrawler",
  "snowflake",
  "zendesk",
]);
export type ConnectorProvider = z.infer<typeof ConnectorProvidersSchema>;

const EditedByUserSchema = z.object({
  editedAt: z.number().nullable(),
  fullName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  email: z.string().nullable(),
  userId: z.string().nullable(),
});

const DataSourceTypeSchema = z.object({
  id: ModelIdSchema,
  sId: z.string(),
  createdAt: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  assistantDefaultSelected: z.boolean(),
  dustAPIProjectId: z.string(),
  dustAPIDataSourceId: z.string(),
  connectorId: z.string().nullable(),
  connectorProvider: ConnectorProvidersSchema.nullable(),
  editedByUser: EditedByUserSchema.nullable().optional(),
});

const CoreAPIDocumentChunkSchema = z.object({
  text: z.string(),
  hash: z.string(),
  offset: z.number(),
  vector: z.array(z.number()).nullable().optional(),
  score: z.number().nullable().optional(),
});

const CoreAPIDocumentSchema = z.object({
  data_source_id: z.string(),
  created: z.number(),
  document_id: z.string(),
  timestamp: z.number(),
  tags: z.array(z.string()),
  source_url: z.string().nullable().optional(),
  hash: z.string(),
  text_size: z.number(),
  chunk_count: z.number(),
  chunks: z.array(CoreAPIDocumentChunkSchema),
  text: z.string().nullable().optional(),
});

const CoreAPILightDocumentSchema = z.object({
  hash: z.string(),
  text_size: z.number(),
  chunk_count: z.number(),
  token_count: z.number(),
  created: z.number(),
});

const CoreAPIRowValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.object({
    type: z.literal("datetime"),
    epoch: z.number(),
    string_value: z.string().optional(),
  }),
  z.null(),
]);

const CoreAPIRowSchema = z.object({
  row_id: z.string(),
  value: z.record(CoreAPIRowValueSchema),
});

const CoreAPITableSchema = z.array(
  z.object({
    name: z.string(),
    value_type: z.enum(["int", "float", "text", "bool", "datetime"]),
    possible_values: z.array(z.string()).nullable().optional(),
  })
);

const CoreAPITablePublicSchema = z.object({
  table_id: z.string(),
  name: z.string(),
  description: z.string(),
  schema: CoreAPITableSchema.nullable(),
  timestamp: z.number(),
  tags: z.array(z.string()),
  parents: z.array(z.string()),
});

export type CoreAPITablePublic = z.infer<typeof CoreAPITablePublicSchema>;

export interface LoggerInterface {
  error: (args: Record<string, unknown>, message: string) => void;
  info: (args: Record<string, unknown>, message: string) => void;
  trace: (args: Record<string, unknown>, message: string) => void;
  warn: (args: Record<string, unknown>, message: string) => void;
}

const DataSourceViewCategoriesSchema = z.enum([
  "managed",
  "folder",
  "website",
  "apps",
]);

const BlockTypeSchema = z.enum([
  "input",
  "data",
  "data_source",
  "code",
  "llm",
  "chat",
  "map",
  "reduce",
  "while",
  "end",
  "search",
  "curl",
  "browser",
  "database_schema",
  "database",
]);

const StatusSchema = z.enum(["running", "succeeded", "errored"]);

const BlockRunConfigSchema = z.record(z.any());

const BlockStatusSchema = z.object({
  block_type: BlockTypeSchema,
  name: z.string(),
  status: StatusSchema,
  success_count: z.number(),
  error_count: z.number(),
});

const RunConfigSchema = z.object({
  blocks: BlockRunConfigSchema,
});

const TraceTypeSchema = z.object({
  value: z.unknown().nullable(),
  error: z.string().nullable(),
  meta: z.unknown().nullable(),
});

const RunStatusSchema = z.object({
  run: StatusSchema,
  blocks: z.array(BlockStatusSchema),
});

const RunTypeSchema = z.object({
  run_id: z.string(),
  created: z.number(),
  run_type: z.enum(["deploy", "local", "execute"]),
  app_hash: z.string().nullable().optional(),
  specification_hash: z.string().nullable().optional(),
  config: RunConfigSchema,
  status: RunStatusSchema,
  traces: z.array(
    z.tuple([
      z.tuple([BlockTypeSchema, z.string()]),
      z.array(z.array(TraceTypeSchema)),
    ])
  ),
  results: z
    .array(
      z.array(
        z.object({
          value: z.unknown().nullable().optional(),
          error: z.string().nullable().optional(),
        })
      )
    )
    .nullable()
    .optional(),
});

const FunctionCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(),
});

const FunctionMessageTypeModelSchema = z.object({
  role: z.literal("function"),
  name: z.string(),
  function_call_id: z.string(),
  content: z.string(),
});

const TokensClassificationSchema = z.enum(["tokens", "chain_of_thought"]);

export const GenerationTokensEventSchema = z.object({
  type: z.literal("generation_tokens"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  text: z.string(),
  classification: z.union([
    TokensClassificationSchema,
    z.enum(["opening_delimiter", "closing_delimiter"]),
  ]),
  delimiterClassification: TokensClassificationSchema.nullable().optional(),
});
export type GenerationTokensEvent = z.infer<typeof GenerationTokensEventSchema>;

const BaseActionTypeSchema = z.enum([
  "dust_app_run_action",
  "tables_query_action",
  "retrieval_action",
  "process_action",
  "websearch_action",
  "browse_action",
  "visualization_action",
]);

const BaseActionSchema = z.object({
  id: ModelIdSchema,
  type: BaseActionTypeSchema,
  renderForFunctionCall: z.function().returns(FunctionCallSchema),
  renderForMultiActionsModel: z
    .function()
    .returns(FunctionMessageTypeModelSchema),
});

const BrowseActionOutputSchema = z.object({
  results: z.array(
    z.object({
      requestedUrl: z.string(),
      browsedUrl: z.string(),
      content: z.string(),
      responseCode: z.string(),
      errorMessage: z.string(),
    })
  ),
});

const BrowseActionTypeSchema = z.object({
  agentMessageId: ModelIdSchema,
  urls: z.array(z.string()),
  output: BrowseActionOutputSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("browse_action"),
});

const DustAppParametersSchema = z.record(
  z.union([z.string(), z.number(), z.boolean()])
);

const DustAppRunActionTypeSchema = z.object({
  agentMessageId: ModelIdSchema,
  appWorkspaceId: z.string(),
  appId: z.string(),
  appName: z.string(),
  params: DustAppParametersSchema,
  runningBlock: z
    .object({
      type: z.string(),
      name: z.string(),
      status: z.enum(["running", "succeeded", "errored"]),
    })
    .nullable(),
  output: z.unknown().nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("dust_app_run_action"),
});

const DataSourceViewKindSchema = z.enum(["default", "custom"]);

const DataSourceViewSchema = z.object({
  category: DataSourceViewCategoriesSchema,
  createdAt: z.number(),
  dataSource: DataSourceTypeSchema,
  editedByUser: EditedByUserSchema.nullable().optional(),
  id: ModelIdSchema,
  kind: DataSourceViewKindSchema,
  parentsIn: z.array(z.string()).nullable(),
  sId: z.string(),
  updatedAt: z.number(),
  vaultId: z.string(),
});
export type DataSourceViewType = z.infer<typeof DataSourceViewSchema>;

const TIME_FRAME_UNITS = ["hour", "day", "week", "month", "year"] as const;
const TimeframeUnitSchema = z.enum(TIME_FRAME_UNITS);

const TimeFrameSchema = z.object({
  duration: z.number(),
  unit: TimeframeUnitSchema,
});

const DataSourceFilterSchema = z.object({
  parents: z
    .object({
      in: z.array(z.string()),
      not: z.array(z.string()),
    })
    .nullable(),
});

const DataSourceConfigurationSchema = z.object({
  workspaceId: z.string(),
  dataSourceViewId: z.string(),
  filter: DataSourceFilterSchema,
});

const RetrievalDocumentChunkTypeSchema = z.object({
  offset: z.number(),
  score: z.number().nullable(),
  text: z.string(),
});

const RetrievalDocumentTypeSchema = z.object({
  chunks: z.array(RetrievalDocumentChunkTypeSchema),
  documentId: z.string(),
  dataSourceView: DataSourceViewSchema.nullable(),
  id: ModelIdSchema,
  reference: z.string(),
  score: z.number().nullable(),
  sourceUrl: z.string().nullable(),
  tags: z.array(z.string()),
  timestamp: z.number(),
});

const RetrievalActionTypeSchema = z.object({
  id: ModelIdSchema,
  agentMessageId: ModelIdSchema,
  params: z.object({
    relativeTimeFrame: TimeFrameSchema.nullable(),
    query: z.string().nullable(),
    topK: z.number(),
  }),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  documents: z.array(RetrievalDocumentTypeSchema).nullable(),
  step: z.number(),
  type: z.literal("retrieval_action"),
});

const ProcessSchemaAllowedTypesSchema = z.enum(["string", "number", "boolean"]);

const ProcessSchemaPropertySchema = z.object({
  name: z.string(),
  type: ProcessSchemaAllowedTypesSchema,
  description: z.string(),
});

const ProcessActionOutputsSchema = z.object({
  data: z.array(z.unknown()),
  min_timestamp: z.number(),
  total_documents: z.number(),
  total_chunks: z.number(),
  total_tokens: z.number(),
  skip_documents: z.number(),
  skip_chunks: z.number(),
  skip_tokens: z.number(),
});

const ProcessActionTypeSchema = z.object({
  id: ModelIdSchema,
  agentMessageId: ModelIdSchema,
  params: z.object({
    relativeTimeFrame: TimeFrameSchema.nullable(),
  }),
  schema: z.array(ProcessSchemaPropertySchema),
  outputs: ProcessActionOutputsSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("process_action"),
});

const TablesQueryActionTypeSchema = z.object({
  id: ModelIdSchema,
  params: DustAppParametersSchema,
  output: z.record(z.union([z.string(), z.number(), z.boolean()])).nullable(),
  resultsFileId: z.string().nullable(),
  resultsFileSnippet: z.string().nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  agentMessageId: ModelIdSchema,
  step: z.number(),
  type: z.literal("tables_query_action"),
});

const WhitelistableFeaturesSchema = z.enum([
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "labs_transcripts_datasource",
  "document_tracker",
  "private_data_vaults_feature",
  "use_app_for_header_detection",
  "openai_o1_feature",
  "openai_o1_mini_feature",
  "snowflake_connector_feature",
  "zendesk_connector_feature",
]);
export type WhitelistableFeature = z.infer<typeof WhitelistableFeaturesSchema>;

const WorkspaceSegmentationSchema = z.enum(["interesting"]).nullable();

const RoleSchema = z.enum(["admin", "builder", "user", "none"]);

const LightWorkspaceSchema = z.object({
  id: ModelIdSchema,
  sId: z.string(),
  name: z.string(),
  role: RoleSchema,
  segmentation: WorkspaceSegmentationSchema,
  whiteListedProviders: ModelProviderIdSchema.array().nullable(),
  defaultEmbeddingProvider: EmbeddingProviderIdSchema.nullable(),
});

const WorkspaceSchema = LightWorkspaceSchema.extend({
  flags: WhitelistableFeaturesSchema.array(),
  ssoEnforced: z.boolean().optional(),
});

const UserProviderSchema = z.enum(["github", "google"]).nullable();

const UserSchema = z.object({
  sId: z.string(),
  id: ModelIdSchema,
  createdAt: z.number(),
  provider: UserProviderSchema,
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  image: z.string().nullable(),
});

const WebsearchActionOutputSchema = z.union([
  z.object({
    results: z.array(
      z.object({
        title: z.string(),
        snippet: z.string(),
        link: z.string(),
        reference: z.string(),
      })
    ),
  }),
  z.object({
    results: z.array(
      z.object({
        title: z.string(),
        snippet: z.string(),
        link: z.string(),
        reference: z.string(),
      })
    ),
    error: z.string(),
  }),
]);

const WebsearchActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  query: z.string(),
  output: WebsearchActionOutputSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("websearch_action"),
});

const GlobalAgentStatusSchema = z.enum([
  "active",
  "disabled_by_admin",
  "disabled_missing_datasource",
  "disabled_free_workspace",
]);

const AgentStatusSchema = z.enum(["active", "archived", "draft"]);

const AgentConfigurationStatusSchema = z.union([
  AgentStatusSchema,
  GlobalAgentStatusSchema,
]);

const AgentConfigurationScopeSchema = z.enum([
  "global",
  "workspace",
  "published",
  "private",
]);

const AgentUserListStatusSchema = z.enum(["in-list", "not-in-list"]);

const AgentUsageTypeSchema = z.object({
  messageCount: z.number(),
  timePeriodSec: z.number(),
});

const AgentRecentAuthorsSchema = z.array(z.string()).readonly();

const AgentModelConfigurationSchema = z.object({
  providerId: ModelProviderIdSchema,
  modelId: z.enum([
    "gpt-3.5-turbo",
    "gpt-4-turbo",
    "gpt-4o-2024-08-06",
    "gpt-4o",
    "gpt-4o-mini",
    "o1-preview",
    "o1-mini",
    "claude-3-opus-20240229",
    "claude-3-5-sonnet-20240620",
    "claude-3-haiku-20240307",
    "claude-2.1",
    "claude-instant-1.2",
    "mistral-large-latest",
    "mistral-medium",
    "mistral-small-latest",
    "codestral-latest",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash-latest",
  ]),
  temperature: z.number(),
});

const LightAgentConfigurationSchema = z.object({
  id: ModelIdSchema,
  versionCreatedAt: z.string().nullable(),
  sId: z.string(),
  version: z.number(),
  versionAuthorId: ModelIdSchema.nullable(),
  instructions: z.string().nullable(),
  model: AgentModelConfigurationSchema,
  status: AgentConfigurationStatusSchema,
  scope: AgentConfigurationScopeSchema,
  userListStatus: AgentUserListStatusSchema.optional(),
  name: z.string(),
  description: z.string(),
  pictureUrl: z.string(),
  lastAuthors: AgentRecentAuthorsSchema.optional(),
  usage: AgentUsageTypeSchema.optional(),
  maxStepsPerRun: z.number(),
  visualizationEnabled: z.boolean(),
  templateId: z.string().nullable(),
  groupIds: z.array(z.string()),
});

const ContentFragmentContextSchema = z.object({
  username: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  profilePictureUrl: z.string().nullable(),
});

const ContentFragmentSchema = z.object({
  id: ModelIdSchema,
  sId: z.string(),
  fileId: z.string().nullable(),
  created: z.number(),
  type: z.literal("content_fragment"),
  visibility: z.enum(["visible", "deleted"]),
  version: z.number(),
  sourceUrl: z.string().nullable(),
  textUrl: z.string(),
  textBytes: z.number().nullable(),
  title: z.string(),
  contentType: SupportedContentFragmentTypeSchema,
  context: ContentFragmentContextSchema,
});

const AgentMentionSchema = z.object({
  configurationId: z.string(),
});

const MentionTypeSchema = AgentMentionSchema;

const MessageVisibilitySchema = z.enum(["visible", "deleted"]);

const UserMessageContextSchema = z.object({
  username: z.string(),
  timezone: Timezone,
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  profilePictureUrl: z.string().nullable(),
  origin: UserMessageOriginSchema,
});

const UserMessageSchema = z.object({
  id: ModelIdSchema,
  created: z.number(),
  type: z.literal("user_message"),
  sId: z.string(),
  visibility: MessageVisibilitySchema,
  version: z.number(),
  user: UserSchema.nullable(),
  mentions: z.array(MentionTypeSchema),
  content: z.string(),
  context: UserMessageContextSchema,
});
export type UserMessageType = z.infer<typeof UserMessageSchema>;

const AgentActionTypeSchema = z.union([
  RetrievalActionTypeSchema,
  DustAppRunActionTypeSchema,
  TablesQueryActionTypeSchema,
  ProcessActionTypeSchema,
  WebsearchActionTypeSchema,
  BrowseActionTypeSchema,
]);

const AgentMessageStatusSchema = z.enum([
  "created",
  "succeeded",
  "failed",
  "cancelled",
]);

const AgentMessageTypeSchema = z.object({
  id: ModelIdSchema,
  agentMessageId: ModelIdSchema,
  created: z.number(),
  type: z.literal("agent_message"),
  sId: z.string(),
  visibility: MessageVisibilitySchema,
  version: z.number(),
  parentMessageId: z.string().nullable(),
  configuration: LightAgentConfigurationSchema,
  status: AgentMessageStatusSchema,
  actions: z.array(AgentActionTypeSchema),
  content: z.string().nullable(),
  chainOfThought: z.string().nullable(),
  rawContents: z.array(
    z.object({
      step: z.number(),
      content: z.string(),
    })
  ),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});
export type AgentMessageType = z.infer<typeof AgentMessageTypeSchema>;

const ConversationVisibilitySchema = z.enum([
  "unlisted",
  "workspace",
  "deleted",
  "test",
]);

const ConversationWithoutContentSchema = z.object({
  id: ModelIdSchema,
  created: z.number(),
  owner: WorkspaceSchema,
  sId: z.string(),
  title: z.string().nullable(),
  visibility: ConversationVisibilitySchema,
  groupIds: z.array(z.string()),
});

export const ConversationSchema = ConversationWithoutContentSchema.extend({
  content: z.array(
    z.union([
      z.array(UserMessageSchema),
      z.array(AgentMessageTypeSchema),
      z.array(ContentFragmentSchema),
    ])
  ),
});
export type ConversationType = z.infer<typeof ConversationSchema>;

const BrowseParamsEventSchema = z.object({
  type: z.literal("browse_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: BrowseActionTypeSchema,
});

const DustAppRunParamsEventSchema = z.object({
  type: z.literal("dust_app_run_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: DustAppRunActionTypeSchema,
});

const DustAppRunBlockEventSchema = z.object({
  type: z.literal("dust_app_run_block"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: DustAppRunActionTypeSchema,
});

const ProcessParamsEventSchema = z.object({
  type: z.literal("process_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  dataSources: z.array(DataSourceConfigurationSchema),
  action: ProcessActionTypeSchema,
});

const RetrievalParamsEventSchema = z.object({
  type: z.literal("retrieval_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  dataSources: z.array(DataSourceConfigurationSchema),
  action: RetrievalActionTypeSchema,
});

const TablesQueryStartedEventSchema = z.object({
  type: z.literal("tables_query_started"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: TablesQueryActionTypeSchema,
});

const TablesQueryModelOutputEventSchema = z.object({
  type: z.literal("tables_query_model_output"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: TablesQueryActionTypeSchema,
});

const TablesQueryOutputEventSchema = z.object({
  type: z.literal("tables_query_output"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: TablesQueryActionTypeSchema,
});

const WebsearchParamsEventSchema = z.object({
  type: z.literal("websearch_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: WebsearchActionTypeSchema,
});

const AgentErrorEventSchema = z.object({
  type: z.literal("agent_error"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type AgentErrorEvent = z.infer<typeof AgentErrorEventSchema>;

const AgentActionSpecificEventSchema = z.union([
  RetrievalParamsEventSchema,
  DustAppRunParamsEventSchema,
  DustAppRunBlockEventSchema,
  TablesQueryStartedEventSchema,
  TablesQueryModelOutputEventSchema,
  TablesQueryOutputEventSchema,
  ProcessParamsEventSchema,
  WebsearchParamsEventSchema,
  BrowseParamsEventSchema,
]);
export type AgentActionSpecificEvent = z.infer<
  typeof AgentActionSpecificEventSchema
>;

const AgentActionSuccessEventSchema = z.object({
  type: z.literal("agent_action_success"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: AgentActionTypeSchema,
});
export type AgentActionSuccessEvent = z.infer<
  typeof AgentActionSuccessEventSchema
>;

const AgentMessageSuccessEventSchema = z.object({
  type: z.literal("agent_message_success"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  message: AgentMessageTypeSchema,
  runIds: z.array(z.string()),
});
export type AgentMessageSuccessEvent = z.infer<
  typeof AgentMessageSuccessEventSchema
>;

const AgentGenerationCancelledEventSchema = z.object({
  type: z.literal("agent_generation_cancelled"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
});
export type AgentGenerationCancelledEvent = z.infer<
  typeof AgentGenerationCancelledEventSchema
>;

const UserMessageErrorEventSchema = z.object({
  type: z.literal("user_message_error"),
  created: z.number(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type UserMessageErrorEvent = z.infer<typeof UserMessageErrorEventSchema>;

// Event sent when the user message is created.
const UserMessageNewEventSchema = z.object({
  type: z.literal("user_message_new"),
  created: z.number(),
  messageId: z.string(),
  message: UserMessageSchema.and(RankSchema),
});
export type UserMessageNewEvent = z.infer<typeof UserMessageNewEventSchema>;

// Event sent when a new message is created (empty) and the agent is about to be executed.
const AgentMessageNewEventSchema = z.object({
  type: z.literal("agent_message_new"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  message: AgentMessageTypeSchema.and(RankSchema),
});
export type AgentMessageNewEvent = z.infer<typeof AgentMessageNewEventSchema>;

// Event sent when the conversation title is updated.
const ConversationTitleEventSchema = z.object({
  type: z.literal("conversation_title"),
  created: z.number(),
  title: z.string(),
});
export type ConversationTitleEvent = z.infer<
  typeof ConversationTitleEventSchema
>;

const ConversationEventTypeSchema = z.object({
  eventId: z.string(),
  data: z.union([
    UserMessageNewEventSchema,
    AgentMessageNewEventSchema,
    AgentGenerationCancelledEventSchema,
    ConversationTitleEventSchema,
  ]),
});

export type ConversationEventType = z.infer<typeof ConversationEventTypeSchema>;

const AgentMessageEventTypeSchema = z.object({
  eventId: z.string(),
  data: z.union([
    AgentErrorEventSchema,
    AgentActionSpecificEventSchema,
    AgentActionSuccessEventSchema,
    AgentGenerationCancelledEventSchema,
    GenerationTokensEventSchema,
  ]),
});

export type AgentMessageEventType = z.infer<typeof AgentMessageEventTypeSchema>;

export const CoreAPIErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
});

export const CoreAPITokenTypeSchema = z.tuple([z.number(), z.string()]);
export type CoreAPITokenType = z.infer<typeof CoreAPITokenTypeSchema>;

const APIErrorTypeSchema = z.enum([
  "action_api_error",
  "action_failed",
  "action_unknown_error",
  "agent_configuration_not_found",
  "agent_message_error",
  "app_auth_error",
  "app_not_found",
  "assistant_saving_error",
  "chat_message_not_found",
  "connector_credentials_error",
  "connector_not_found_error",
  "connector_oauth_target_mismatch",
  "connector_provider_not_supported",
  "connector_update_error",
  "connector_update_unauthorized",
  "conversation_access_restricted",
  "conversation_not_found",
  "data_source_auth_error",
  "data_source_document_not_found",
  "data_source_error",
  "data_source_not_found",
  "data_source_not_managed",
  "data_source_quota_error",
  "data_source_view_not_found",
  "dataset_not_found",
  "dust_app_secret_not_found",
  "feature_flag_already_exists",
  "feature_flag_not_found",
  "file_not_found",
  "file_too_large",
  "file_type_not_supported",
  "global_agent_error",
  "group_not_found",
  "internal_server_error",
  "invalid_api_key_error",
  "invalid_pagination_parameters",
  "invalid_request_error",
  "invalid_rows_request_error",
  "invitation_already_sent_recently",
  "invitation_not_found",
  "key_not_found",
  "malformed_authorization_header_error",
  "membership_not_found",
  "message_not_found",
  "method_not_supported_error",
  "missing_authorization_header_error",
  "not_authenticated",
  "personal_workspace_not_found",
  "plan_limit_error",
  "plan_message_limit_exceeded",
  "plugin_execution_failed",
  "plugin_not_found",
  "provider_auth_error",
  "provider_not_found",
  "rate_limit_error",
  "run_error",
  "run_not_found",
  "stripe_invalid_product_id_error",
  "subscription_not_found",
  "subscription_payment_failed",
  "subscription_state_invalid",
  "table_not_found",
  "template_not_found",
  "template_not_found",
  "transcripts_configuration_already_exists",
  "transcripts_configuration_default_not_allowed",
  "transcripts_configuration_not_found",
  "unexpected_action_response",
  "unexpected_error_format",
  "unexpected_network_error",
  "unexpected_response_format",
  "user_not_found",
  "vault_already_exists",
  "vault_not_found",
  "workspace_auth_error",
  "workspace_not_found",
  "workspace_not_found",
  "workspace_user_not_found",
]);

export const APIErrorSchema = z.object({
  type: APIErrorTypeSchema,
  message: z.string(),
  data_source_error: CoreAPIErrorSchema.optional(),
  run_error: CoreAPIErrorSchema.optional(),
  app_error: CoreAPIErrorSchema.optional(),
  connectors_error: ConnectorsAPIErrorSchema.optional(),
});
export type APIError = z.infer<typeof APIErrorSchema>;

export const WorkspaceDomainSchema = z.object({
  domain: z.string(),
  domainAutoJoinEnabled: z.boolean(),
});

export const DustAppTypeSchema = z.object({
  appHash: z.string(),
  appId: z.string(),
  workspaceId: z.string(),
});

export type DustAppType = z.infer<typeof DustAppTypeSchema>;

export const DustAppConfigTypeSchema = z.record(z.unknown());
export type DustAppConfigType = z.infer<typeof DustAppConfigTypeSchema>;

export const DustAppRunErroredEventSchema = z.object({
  type: z.literal("error"),
  content: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type DustAppRunErroredEvent = z.infer<
  typeof DustAppRunErroredEventSchema
>;

export const DustAppRunRunStatusEventSchema = z.object({
  type: z.literal("run_status"),
  content: z.object({
    status: z.enum(["running", "succeeded", "errored"]),
    run_id: z.string(),
  }),
});
export type DustAppRunRunStatusEvent = z.infer<
  typeof DustAppRunRunStatusEventSchema
>;

export const DustAppRunBlockStatusEventSchema = z.object({
  type: z.literal("block_status"),
  content: z.object({
    block_type: BlockTypeSchema,
    name: z.string(),
    status: StatusSchema,
    success_count: z.number(),
    error_count: z.number(),
  }),
});
export type DustAppRunBlockStatusEvent = z.infer<
  typeof DustAppRunBlockStatusEventSchema
>;

export const DustAppRunBlockExecutionEventSchema = z.object({
  type: z.literal("block_execution"),
  content: z.object({
    block_type: BlockTypeSchema,
    block_name: z.string(),
    execution: z.array(
      z.array(
        z.object({
          value: z.unknown().nullable(),
          error: z.string().nullable(),
          meta: z.unknown().nullable(),
        })
      )
    ),
  }),
});
export type DustAppRunBlockExecutionEvent = z.infer<
  typeof DustAppRunBlockExecutionEventSchema
>;
export const DustAppRunFinalEventSchema = z.object({
  type: z.literal("final"),
});
export type DustAppRunFinalEvent = z.infer<typeof DustAppRunFinalEventSchema>;

export const DustAppRunTokensEventSchema = z.object({
  type: z.literal("tokens"),
  content: z.object({
    block_type: z.string(),
    block_name: z.string(),
    input_index: z.number(),
    map: z
      .object({
        name: z.string(),
        iteration: z.number(),
      })
      .nullable(),
    tokens: z.object({
      text: z.string(),
      tokens: z.array(z.string()).optional(),
      logprobs: z.array(z.number()).optional(),
    }),
  }),
});
export type DustAppRunTokensEvent = z.infer<typeof DustAppRunTokensEventSchema>;

export const DustAppRunFunctionCallEventSchema = z.object({
  type: z.literal("function_call"),
  content: z.object({
    block_type: z.string(),
    block_name: z.string(),
    input_index: z.number(),
    map: z
      .object({
        name: z.string(),
        iteration: z.number(),
      })
      .nullable(),
    function_call: z.object({
      name: z.string(),
    }),
  }),
});
export type DustAppRunFunctionCallEvent = z.infer<
  typeof DustAppRunFunctionCallEventSchema
>;

export const DustAppRunFunctionCallArgumentsTokensEventSchema = z.object({
  type: z.literal("function_call_arguments_tokens"),
  content: z.object({
    block_type: z.string(),
    block_name: z.string(),
    input_index: z.number(),
    map: z
      .object({
        name: z.string(),
        iteration: z.number(),
      })
      .nullable(),
    tokens: z.object({
      text: z.string(),
    }),
  }),
});
export type DustAppRunFunctionCallArgumentsTokensEvent = z.infer<
  typeof DustAppRunFunctionCallArgumentsTokensEventSchema
>;
export type DustAPICredentials = {
  apiKey: string;
  workspaceId: string;
  extraHeaders?: Record<string, string>;
  groupIds?: string[];
  userEmail?: string;
};

const VaultKindSchema = z.enum(["regular", "global", "system", "public"]);

const VaultTypeSchema = z.object({
  name: z.string(),
  sId: z.string(),
  kind: VaultKindSchema,
  groupIds: z.array(z.string()),
});

const AppTypeSchema = z.object({
  id: ModelIdSchema,
  sId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  savedSpecification: z.string().nullable(),
  savedConfig: z.string().nullable(),
  savedRun: z.string().nullable(),
  dustAPIProjectId: z.string(),
  vault: VaultTypeSchema,
});

export const RunAppResponseSchema = z.object({
  run: RunTypeSchema,
});

export type RunAppResponseType = z.infer<typeof RunAppResponseSchema>;

export const GetDataSourcesResponseSchema = z.object({
  data_sources: DataSourceTypeSchema.array(),
});

export type GetDataSourcesResponseType = z.infer<
  typeof GetDataSourcesResponseSchema
>;

export const GetAgentConfigurationsResponseSchema = z.object({
  agentConfigurations: LightAgentConfigurationSchema.array(),
});

export type GetAgentConfigurationsResponseType = z.infer<
  typeof GetAgentConfigurationsResponseSchema
>;

export const PostContentFragmentResponseSchema = z.object({
  contentFragment: ContentFragmentSchema,
});

export type PostContentFragmentResponseType = z.infer<
  typeof PostContentFragmentResponseSchema
>;

export const CreateConversationResponseSchema = z.object({
  conversation: ConversationSchema,
  message: UserMessageSchema,
});

export type CreateConversationResponseType = z.infer<
  typeof CreateConversationResponseSchema
>;

export const PostUserMessageResponseSchema = z.object({
  message: UserMessageSchema,
});

export type PostUserMessageResponseType = z.infer<
  typeof PostUserMessageResponseSchema
>;

export const GetConversationResponseSchema = z.object({
  conversation: ConversationSchema,
});

export type GetConversationResponseType = z.infer<
  typeof GetConversationResponseSchema
>;

export const TokenizeResponseSchema = z.object({
  tokens: CoreAPITokenTypeSchema.array(),
});

export type TokenizeResponseType = z.infer<typeof TokenizeResponseSchema>;

export const GetActiveMemberEmailsInWorkspaceResponseSchema = z.object({
  emails: z.array(z.string()),
});

export type GetActiveMemberEmailsInWorkspaceResponseType = z.infer<
  typeof GetActiveMemberEmailsInWorkspaceResponseSchema
>;

export const GetWorkspaceVerifiedDomainsResponseSchema = z.object({
  verified_domains: WorkspaceDomainSchema.array(),
});

export type GetWorkspaceVerifiedDomainsResponseType = z.infer<
  typeof GetWorkspaceVerifiedDomainsResponseSchema
>;

export const GetWorkspaceFeatureFlagsResponseSchema = z.object({
  feature_flags: WhitelistableFeaturesSchema.array(),
});

export type GetWorkspaceFeatureFlagsResponseType = z.infer<
  typeof GetWorkspaceFeatureFlagsResponseSchema
>;

export const PatchDataSourceViewsResponseSchema = z.object({
  data_source_views: DataSourceViewSchema.array(),
});

export type PatchDataSourceViewsReponseType = z.infer<
  typeof PatchDataSourceViewsResponseSchema
>;

export const PublicPostMessagesRequestBodySchema = z.intersection(
  z.object({
    content: z.string(),
    mentions: z.array(
      z.object({
        configurationId: z.string(),
      })
    ),
    context: UserMessageContextSchema,
  }),
  z
    .object({
      blocking: z.boolean().optional(),
    })
    .partial()
);
export type PublicPostMessagesRequestBody = z.infer<
  typeof PublicPostMessagesRequestBodySchema
>;

export type PostMessagesResponseBody = {
  message: UserMessageType;
  agentMessages?: AgentMessageType[];
};

export const PublicPostContentFragmentRequestBodySchema = z.object({
  title: z.string(),
  content: z.string(),
  url: z.string().nullable(),
  contentType: SupportedContentFragmentTypeSchema,
  context: ContentFragmentContextSchema.nullable(),
});
export type PublicPostContentFragmentRequestBody = z.infer<
  typeof PublicPostContentFragmentRequestBodySchema
>;

export const PublicPostConversationsRequestBodySchema = z.intersection(
  z.object({
    title: z.string().nullable(),
    visibility: z.enum(["unlisted", "workspace", "deleted", "test"]),
    message: z.union([
      z.intersection(
        z.object({
          content: z.string(),
          mentions: z.array(
            z.object({
              configurationId: z.string(),
            })
          ),
          context: UserMessageContextSchema,
        }),
        z
          .object({
            blocking: z.boolean().optional(),
          })
          .partial()
      ),
      z.undefined(),
    ]),
    contentFragment: z.union([
      z.object({
        title: z.string(),
        content: z.string(),
        url: z.string().nullable(),
        contentType: SupportedContentFragmentTypeSchema,
        context: ContentFragmentContextSchema.nullable(),
      }),
      z.undefined(),
    ]),
  }),
  z
    .object({
      blocking: z.boolean().optional(),
    })
    .partial()
);

export type PublicPostConversationsRequestBody = z.infer<
  typeof PublicPostConversationsRequestBodySchema
>;

export const PostConversationsResponseSchema = z.object({
  conversation: ConversationSchema,
  message: UserMessageSchema.optional(),
  contentFragment: ContentFragmentSchema.optional(),
});

export type PostConversationsResponseType = z.infer<
  typeof PostConversationsResponseSchema
>;

export const SearchDataSourceViewsRequestSchema = z.object({
  dataSourceId: z.string().optional(),
  kind: z.string().optional(),
  vaultId: z.string().optional(),
  vaultKind: z.string().optional(),
});

export const SearchDataSourceViewsResponseSchema = z.object({
  data_source_views: DataSourceViewSchema.array(),
});

export type SearchDataSourceViewsResponseType = z.infer<
  typeof SearchDataSourceViewsResponseSchema
>;

const ListMemberEmailsResponseSchema = z.object({
  emails: z.array(z.string()),
});

export type ListMemberEmailsResponseType = z.infer<
  typeof ListMemberEmailsResponseSchema
>;

export const ValidateMemberRequestSchema = z.object({
  email: z.string(),
});

const ValidateMemberResponseSchema = z.object({
  valid: z.boolean(),
});

export type ValidateMemberResponseType = z.infer<
  typeof ValidateMemberResponseSchema
>;

const GetAppsResponseSchema = z.object({
  apps: AppTypeSchema.array(),
});

export type GetAppsResponseType = z.infer<typeof GetAppsResponseSchema>;

const DataSourceViewsResponseSchema = z.object({
  dataSourceView: DataSourceViewSchema,
});

export type DataSourceViewsResponseType = z.infer<
  typeof DataSourceViewsResponseSchema
>;

export const PatchDataSourceViewRequestSchema = z.union([
  z
    .object({
      parentsToAdd: z.union([z.array(z.string()), z.undefined()]),
      parentsToRemove: z.array(z.string()).optional(),
    })
    // For the fields to be not optional, see https://stackoverflow.com/questions/71477015/specify-a-zod-schema-with-a-non-optional-but-possibly-undefined-field
    .transform((o) => ({
      parentsToAdd: o.parentsToAdd,
      parentsToRemove: o.parentsToRemove,
    })),
  z.object({
    parentsIn: z.array(z.string()),
  }),
]);

export type PatchDataSourceViewRequestType = z.infer<
  typeof PatchDataSourceViewRequestSchema
>;

export const DataSourceSearchQuerySchema = z.object({
  query: z.string(),
  top_k: z.number(),
  full_text: z.boolean(),
  target_document_tokens: z.number().optional(),
  timestamp_gt: z.number().optional(),
  timestamp_lt: z.number().optional(),
  tags_in: z.array(z.string()).optional(),
  tags_not: z.array(z.string()).optional(),
  parents_in: z.array(z.string()).optional(),
  parents_not: z.array(z.string()).optional(),
});

export type DataSourceSearchQuery = z.infer<typeof DataSourceSearchQuerySchema>;

const DataSourceSearchResponseSchema = z.object({
  documents: CoreAPIDocumentSchema.array(),
});

export type DataSourceSearchResponseType = z.infer<
  typeof DataSourceSearchResponseSchema
>;

const DataSourceViewsListResponseSchema = z.object({
  dataSourceViews: DataSourceViewSchema.array(),
});

export type DataSourceViewsListResponseType = z.infer<
  typeof DataSourceViewsListResponseSchema
>;

type FrontDataSourceDocumentSection = {
  prefix: string | null;
  content: string | null;
  sections: FrontDataSourceDocumentSection[];
};

const FrontDataSourceDocumentSectionSchema: z.ZodSchema<FrontDataSourceDocumentSection> =
  z.lazy(() =>
    z.object({
      prefix: z.string().nullable(),
      content: z.string().nullable(),
      sections: z.array(FrontDataSourceDocumentSectionSchema),
    })
  );

export const PostDataSourceDocumentRequestSchema = z.object({
  timestamp: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  parents: z.array(z.string()).nullable().optional(),
  source_url: z.string().nullable().optional(),
  upsert_context: z
    .object({
      sync_type: z.union([z.enum(["batch", "incremental"]), z.undefined()]),
    }) // For the fields to be not optional, see https://stackoverflow.com/questions/71477015/specify-a-zod-schema-with-a-non-optional-but-possibly-undefined-field
    .transform((o) => ({
      sync_type: o.sync_type,
    })),
  text: z.string().nullable().optional(),
  section: FrontDataSourceDocumentSectionSchema.nullable().optional(),
  light_document_output: z.boolean().optional(),
  async: z.boolean().nullable().optional(),
});

const GetDocumentResponseSchema = z.object({
  document: CoreAPIDocumentSchema,
});
export type GetDocumentResponseType = z.infer<typeof GetDocumentResponseSchema>;

const DeleteDocumentResponseSchema = z.object({
  document: z.object({
    document_id: z.string(),
  }),
});
export type DeleteDocumentResponseType = z.infer<
  typeof DeleteDocumentResponseSchema
>;

const UpsertDocumentResponseSchema = z.object({
  document: z.union([
    CoreAPIDocumentSchema,
    CoreAPILightDocumentSchema,
    z.object({
      document_id: z.string(),
    }),
  ]),
  data_source: DataSourceTypeSchema,
});
export type UpsertDocumentResponseType = z.infer<
  typeof UpsertDocumentResponseSchema
>;

const PostParentsResponseSchema = z.object({
  updated: z.boolean(),
});
export type PostParentsResponseType = z.infer<typeof PostParentsResponseSchema>;

const GetDocumentsResponseSchema = z.object({
  documents: z.array(CoreAPIDocumentSchema),
  total: z.number(),
});

export type GetDocumentsResponseType = z.infer<
  typeof GetDocumentsResponseSchema
>;

const GetTableRowsResponseSchema = z.object({
  row: CoreAPIRowSchema,
});

export type GetTableRowsResponseType = z.infer<
  typeof GetTableRowsResponseSchema
>;
export const UpsertTableRowsRequestSchema = z.object({
  rows: z.array(
    z.object({
      row_id: z.string(),
      value: z.record(
        z
          .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.object({
              type: z.literal("datetime"),
              epoch: z.number(),
            }),
          ])
          .nullable()
      ),
    })
  ),
  truncate: z.boolean().optional(),
});

export type CellValueType = z.infer<
  typeof UpsertTableRowsRequestSchema
>["rows"][number]["value"][string];

const UpsertTableRowsResponseSchema = z.object({
  table: z.object({
    name: z.string(),
    table_id: z.string(),
    description: z.string(),
    schema: CoreAPITableSchema.nullable(),
  }),
});

export type UpsertTableRowsResponseType = z.infer<
  typeof UpsertTableRowsResponseSchema
>;

const ListTableRowsResponseSchema = z.object({
  rows: z.array(CoreAPIRowSchema),
  offset: z.number(),
  limit: z.number(),
  total: z.number(),
});
export type ListTableRowsResponseType = z.infer<
  typeof ListTableRowsResponseSchema
>;

const GetTableResponseSchema = z.object({
  table: CoreAPITablePublicSchema,
});
export type GetTableResponseType = z.infer<typeof GetTableResponseSchema>;

export const PostTableParentsRequestSchema = z.object({
  parents: z.array(z.string()),
});

const PostTableParentsResponseSchema = z.object({
  updated: z.literal(true),
});
export type PostTableParentsResponseType = z.infer<
  typeof PostTableParentsResponseSchema
>;

export const UpsertTableFromCsvRequestSchema = z.intersection(
  z
    .object({
      name: z.string(),
      description: z.string(),
      timestamp: z.number().nullable().optional(),
      tags: z.array(z.string()).nullable().optional(),
      parents: z.array(z.string()).nullable().optional(),
      truncate: z.boolean(),
      useAppForHeaderDetection: z.boolean().nullable().optional(),
      async: z.boolean().optional(),
    })
    .transform((o) => ({
      name: o.name,
      description: o.description,
      timestamp: o.timestamp,
      tags: o.tags,
      parents: o.parents,
      truncate: o.truncate,
      useAppForHeaderDetection: o.useAppForHeaderDetection,
      async: o.async,
    })),
  z.union([
    z.object({ csv: z.string(), tableId: z.undefined() }).transform((o) => ({
      csv: o.csv,
      tableId: o.tableId,
    })),
    z
      .object({
        csv: z.string().optional(),
        tableId: z.string(),
      })
      .transform((o) => ({
        csv: o.csv,
        tableId: o.tableId,
      })),
  ])
);

const PostTableCSVAsyncResponseSchema = z.object({
  table: z.object({
    table_id: z.string(),
  }),
});
export type PostTableCSVAsyncResponseType = z.infer<
  typeof PostTableCSVAsyncResponseSchema
>;

const PostTableCSVResponseSchema = z.object({
  table: CoreAPITableSchema,
});
export type PostTableCSVResponseType = z.infer<
  typeof PostTableCSVResponseSchema
>;

const ListTablesResponseSchema = z.object({
  tables: z.array(CoreAPITablePublicSchema),
});
export type ListTablesResponseType = z.infer<typeof ListTablesResponseSchema>;

export const UpsertDatabaseTableRequestSchema = z.object({
  table_id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  timestamp: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  parents: z.array(z.string()).nullable().optional(),
  remote_database_table_id: z.string().nullable().optional(),
  remote_database_secret_id: z.string().nullable().optional(),
});

const UpsertTableResponseSchema = z.object({
  table: CoreAPITablePublicSchema,
});
export type UpsertTableResponseType = z.infer<typeof UpsertTableResponseSchema>;

const usageTables = [
  "users",
  "assistant_messages",
  "builders",
  "assistants",
  "all",
] as const;

const SupportedUsageTablesSchema = z.enum(usageTables);

export type UsageTableType = z.infer<typeof SupportedUsageTablesSchema>;

const MonthSchema = z
  .string()
  .refine((s): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(s), "YYYY-MM");

export const GetWorkspaceUsageRequestSchema = z.union([
  z.object({
    start: MonthSchema,
    end: z.undefined(),
    mode: z.literal("month"),
    table: SupportedUsageTablesSchema,
  }),
  z.object({
    start: MonthSchema,
    end: MonthSchema,
    mode: z.literal("range"),
    table: SupportedUsageTablesSchema,
  }),
]);

export type GetWorkspaceUsageRequestType = z.infer<
  typeof GetWorkspaceUsageRequestSchema
>;
