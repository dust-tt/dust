import moment from "moment-timezone";
import { z } from "zod";

const ModelProviderIdSchema = z.enum([
  "openai",
  "anthropic",
  "mistral",
  "google_ai_studio",
]);
type ModelProviderIdType = z.infer<typeof ModelProviderIdSchema>;

const EmbeddingProviderIdSchema = z.enum(["openai", "mistral"]);
type EmbeddingProviderIdType = z.infer<typeof EmbeddingProviderIdSchema>;

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
type ConnectorsAPIError = z.infer<typeof ConnectorsAPIErrorSchema>;

type ModelId = z.infer<typeof ModelIdSchema>;

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

export const PublicPostMessagesRequestBodySchema = z.intersection(
  z.object({
    content: z.string(),
    mentions: z.array(
      z.object({
        configurationId: z.string(),
      })
    ),
    context: z.object({
      timezone: Timezone,
      username: z.string(),
      fullName: z.string().nullable(),
      email: z.string().nullable(),
      profilePictureUrl: z.string().nullable(),
      origin: z
        .union([
          z.literal("slack"),
          z.literal("web"),
          z.literal("api"),
          z.literal("gsheet"),
          z.literal("zapier"),
          z.literal("make"),
          z.literal("zendesk"),
          z.literal("raycast"),
          z.null(),
          z.undefined(),
        ])
        .nullable(),
    }),
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
  contentType: z.unknown(),
  context: z
    .object({
      profilePictureUrl: z.string().nullable(),
      fullName: z.string().nullable(),
      email: z.string().nullable(),
      username: z.string().nullable(),
    })
    .nullable(),
});
export type PublicPostContentFragmentRequestBody = z.infer<
  typeof PublicPostContentFragmentRequestBodySchema
>;

export const PublicPostConversationsRequestBodySchema = z.intersection(
  z.object({
    title: z.string().nullable(),
    visibility: z.union([
      z.literal("unlisted"),
      z.literal("workspace"),
      z.literal("deleted"),
      z.literal("test"),
    ]),
    message: z.union([
      z.intersection(
        z.object({
          content: z.string(),
          mentions: z.array(
            z.object({
              configurationId: z.string(),
            })
          ),
          context: z.object({
            timezone: Timezone,
            username: z.string(),
            fullName: z.string().nullable(),
            email: z.string().nullable(),
            profilePictureUrl: z.string().nullable(),
            origin: z
              .union([
                z.literal("slack"),
                z.literal("web"),
                z.literal("api"),
                z.literal("gsheet"),
                z.literal("zapier"),
                z.literal("make"),
                z.literal("zendesk"),
                z.literal("raycast"),
                z.null(),
                z.undefined(),
              ])
              .nullable(),
          }),
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
        contentType: z.unknown(),
        context: z
          .object({
            profilePictureUrl: z.string().nullable(),
            fullName: z.string().nullable(),
            email: z.string().nullable(),
            username: z.string().nullable(),
          })
          .nullable(),
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
]);
export type ConnectorProvider = z.infer<typeof ConnectorProvidersSchema>;

const EditedByUserSchema = z.object({
  editedAt: z.number().nullable(),
  fullName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  email: z.string().nullable(),
  userId: z.string().nullable(),
});
type EditedByUser = z.infer<typeof EditedByUserSchema>;

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

type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

export interface LoggerInterface {
  error: (args: Record<string, unknown>, message: string) => void;
  info: (args: Record<string, unknown>, message: string) => void;
  trace: (args: Record<string, unknown>, message: string) => void;
  warn: (args: Record<string, unknown>, message: string) => void;
}
const PatchDataSourceViewSchema = z.union([
  z.object({
    parentsToAdd: z.array(z.string()).optional(),
    parentsToRemove: z.array(z.string()).optional(),
  }),
  z.object({
    parentsIn: z.array(z.string()),
  }),
]);
export type PatchDataSourceViewType = z.infer<typeof PatchDataSourceViewSchema>;
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
  delimiterClassification: TokensClassificationSchema.nullable(),
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
type BaseActionType = z.infer<typeof BaseActionTypeSchema>;

const BaseActionSchema = z.object({
  id: ModelIdSchema,
  type: BaseActionTypeSchema,
  renderForFunctionCall: z.function().returns(FunctionCallSchema),
  renderForMultiActionsModel: z
    .function()
    .returns(FunctionMessageTypeModelSchema),
});
type BaseAction = z.infer<typeof BaseActionSchema>;
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
type BrowseActionOutputType = z.infer<typeof BrowseActionOutputSchema>;
const BrowseActionTypeSchema = z.object({
  agentMessageId: ModelIdSchema,
  urls: z.array(z.string()),
  output: BrowseActionOutputSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("browse_action"),
});
type BrowseActionType = z.infer<typeof BrowseActionTypeSchema>;

const DustAppParametersSchema = z.record(
  z.union([z.string(), z.number(), z.boolean()])
);
type DustAppParameters = z.infer<typeof DustAppParametersSchema>;

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
type DustAppRunActionType = z.infer<typeof DustAppRunActionTypeSchema>;
const DataSourceViewKindSchema = z.enum(["default", "custom"]);
type DataSourceViewKind = z.infer<typeof DataSourceViewKindSchema>;

const DataSourceViewSchema = z.object({
  category: DataSourceViewCategoriesSchema,
  createdAt: z.number(),
  dataSource: DataSourceTypeSchema,
  editedByUser: EditedByUserSchema.nullable(),
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
type TimeframeUnit = z.infer<typeof TimeframeUnitSchema>;

const TimeFrameSchema = z.object({
  duration: z.number(),
  unit: TimeframeUnitSchema,
});
type TimeFrame = z.infer<typeof TimeFrameSchema>;

const DataSourceFilterSchema = z.object({
  parents: z
    .object({
      in: z.array(z.string()),
      not: z.array(z.string()),
    })
    .nullable(),
});
type DataSourceFilter = z.infer<typeof DataSourceFilterSchema>;

const DataSourceConfigurationSchema = z.object({
  workspaceId: z.string(),
  dataSourceViewId: z.string(),
  filter: DataSourceFilterSchema,
});
type DataSourceConfiguration = z.infer<typeof DataSourceConfigurationSchema>;

const RetrievalDocumentChunkTypeSchema = z.object({
  offset: z.number(),
  score: z.number().nullable(),
  text: z.string(),
});
type RetrievalDocumentChunkType = z.infer<
  typeof RetrievalDocumentChunkTypeSchema
>;

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
type RetrievalDocumentType = z.infer<typeof RetrievalDocumentTypeSchema>;

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
type RetrievalActionType = z.infer<typeof RetrievalActionTypeSchema>;

const ProcessSchemaAllowedTypesSchema = z.enum(["string", "number", "boolean"]);
type ProcessSchemaAllowedTypes = z.infer<
  typeof ProcessSchemaAllowedTypesSchema
>;

const ProcessSchemaPropertySchema = z.object({
  name: z.string(),
  type: ProcessSchemaAllowedTypesSchema,
  description: z.string(),
});
type ProcessSchemaPropertyType = z.infer<typeof ProcessSchemaPropertySchema>;

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
type ProcessActionOutputsType = z.infer<typeof ProcessActionOutputsSchema>;

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
type ProcessActionType = z.infer<typeof ProcessActionTypeSchema>;

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
type TablesQueryActionType = z.infer<typeof TablesQueryActionTypeSchema>;

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
]);
export type WhitelistableFeature = z.infer<typeof WhitelistableFeaturesSchema>;

const WorkspaceSegmentationSchema = z.enum(["interesting"]).nullable();
type WorkspaceSegmentationType = z.infer<typeof WorkspaceSegmentationSchema>;

const RoleSchema = z.enum(["admin", "builder", "user", "none"]);
type RoleType = z.infer<typeof RoleSchema>;

const LightWorkspaceSchema = z.object({
  id: ModelIdSchema,
  sId: z.string(),
  name: z.string(),
  role: RoleSchema,
  segmentation: WorkspaceSegmentationSchema,
  whiteListedProviders: ModelProviderIdSchema.array().nullable(),
  defaultEmbeddingProvider: EmbeddingProviderIdSchema.nullable(),
});
type LightWorkspaceType = z.infer<typeof LightWorkspaceSchema>;

const WorkspaceSchema = LightWorkspaceSchema.extend({
  flags: WhitelistableFeaturesSchema.array(),
  ssoEnforced: z.boolean().optional(),
});
type WorkspaceType = z.infer<typeof WorkspaceSchema>;

const UserProviderSchema = z.enum(["github", "google"]).nullable();
type UserProviderType = z.infer<typeof UserProviderSchema>;

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
type UserType = z.infer<typeof UserSchema>;
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
type WebsearchActionOutputType = z.infer<typeof WebsearchActionOutputSchema>;

const WebsearchActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  query: z.string(),
  output: WebsearchActionOutputSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("websearch_action"),
});
type WebsearchActionType = z.infer<typeof WebsearchActionTypeSchema>;

const GlobalAgentStatusSchema = z.enum([
  "active",
  "disabled_by_admin",
  "disabled_missing_datasource",
  "disabled_free_workspace",
]);
type GlobalAgentStatus = z.infer<typeof GlobalAgentStatusSchema>;

const AgentStatusSchema = z.enum(["active", "archived", "draft"]);
type AgentStatus = z.infer<typeof AgentStatusSchema>;

const AgentConfigurationStatusSchema = z.union([
  AgentStatusSchema,
  GlobalAgentStatusSchema,
]);
type AgentConfigurationStatus = z.infer<typeof AgentConfigurationStatusSchema>;

const AgentConfigurationScopeSchema = z.enum([
  "global",
  "workspace",
  "published",
  "private",
]);
type AgentConfigurationScope = z.infer<typeof AgentConfigurationScopeSchema>;

const AgentUserListStatusSchema = z.enum(["in-list", "not-in-list"]);
type AgentUserListStatus = z.infer<typeof AgentUserListStatusSchema>;

const AgentUsageTypeSchema = z.object({
  messageCount: z.number(),
  timePeriodSec: z.number(),
});
type AgentUsageType = z.infer<typeof AgentUsageTypeSchema>;

const AgentRecentAuthorsSchema = z.array(z.string()).readonly();
type AgentRecentAuthors = z.infer<typeof AgentRecentAuthorsSchema>;
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
type AgentModelConfigurationType = z.infer<
  typeof AgentModelConfigurationSchema
>;

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
  userListStatus: AgentUserListStatusSchema.nullable(),
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

export type LightAgentConfigurationType = z.infer<
  typeof LightAgentConfigurationSchema
>;

const ContentFragmentContextSchema = z.object({
  username: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  profilePictureUrl: z.string().nullable(),
});
type ContentFragmentContextType = z.infer<typeof ContentFragmentContextSchema>;

const SupportedContentFragmentTypeSchema = z.enum([
  ...(["dust-application/slack"] as const),
]);
type SupportedContentFragmentType = z.infer<
  typeof SupportedContentFragmentTypeSchema
>;

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
export type ContentFragmentType = z.infer<typeof ContentFragmentSchema>;

const AgentMentionSchema = z.object({
  configurationId: z.string(),
});
type AgentMention = z.infer<typeof AgentMentionSchema>;

const MentionTypeSchema = AgentMentionSchema;
type MentionType = z.infer<typeof MentionTypeSchema>;

const MessageVisibilitySchema = z.enum(["visible", "deleted"]);
type MessageVisibility = z.infer<typeof MessageVisibilitySchema>;

const UserMessageOriginSchema = z.enum([
  "slack",
  "web",
  "api",
  "gsheet",
  "zapier",
  "make",
  "zendesk",
  "raycast",
]);
type UserMessageOrigin = z.infer<typeof UserMessageOriginSchema>;

const UserMessageContextSchema = z.object({
  username: z.string(),
  timezone: z.string(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  profilePictureUrl: z.string().nullable(),
  origin: UserMessageOriginSchema.nullable(),
});
type UserMessageContext = z.infer<typeof UserMessageContextSchema>;

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
type AgentActionType = z.infer<typeof AgentActionTypeSchema>;

const AgentMessageStatusSchema = z.enum([
  "created",
  "succeeded",
  "failed",
  "cancelled",
]);
type AgentMessageStatus = z.infer<typeof AgentMessageStatusSchema>;

export const AgentMessageTypeSchema = z.object({
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
type ConversationVisibility = z.infer<typeof ConversationVisibilitySchema>;

const ConversationWithoutContentSchema = z.object({
  id: ModelIdSchema,
  created: z.number(),
  owner: WorkspaceSchema,
  sId: z.string(),
  title: z.string().nullable(),
  visibility: ConversationVisibilitySchema,
  groupIds: z.array(z.string()),
});
type ConversationWithoutContentType = z.infer<
  typeof ConversationWithoutContentSchema
>;

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

const ConversationErrorTypeSchema = z.enum([
  "conversation_not_found",
  "conversation_access_restricted",
]);
type ConversationErrorType = z.infer<typeof ConversationErrorTypeSchema>;

const BrowseParamsEventSchema = z.object({
  type: z.literal("browse_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: BrowseActionTypeSchema,
});
type BrowseParamsEvent = z.infer<typeof BrowseParamsEventSchema>;

const DustAppRunParamsEventSchema = z.object({
  type: z.literal("dust_app_run_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: DustAppRunActionTypeSchema,
});
type DustAppRunParamsEvent = z.infer<typeof DustAppRunParamsEventSchema>;

const DustAppRunBlockEventSchema = z.object({
  type: z.literal("dust_app_run_block"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: DustAppRunActionTypeSchema,
});
type DustAppRunBlockEvent = z.infer<typeof DustAppRunBlockEventSchema>;

const ProcessParamsEventSchema = z.object({
  type: z.literal("process_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  dataSources: z.array(DataSourceConfigurationSchema),
  action: ProcessActionTypeSchema,
});
type ProcessParamsEvent = z.infer<typeof ProcessParamsEventSchema>;

const RetrievalParamsEventSchema = z.object({
  type: z.literal("retrieval_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  dataSources: z.array(DataSourceConfigurationSchema),
  action: RetrievalActionTypeSchema,
});
type RetrievalParamsEvent = z.infer<typeof RetrievalParamsEventSchema>;

const TablesQueryStartedEventSchema = z.object({
  type: z.literal("tables_query_started"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: TablesQueryActionTypeSchema,
});
type TablesQueryStartedEvent = z.infer<typeof TablesQueryStartedEventSchema>;

const TablesQueryModelOutputEventSchema = z.object({
  type: z.literal("tables_query_model_output"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: TablesQueryActionTypeSchema,
});
type TablesQueryModelOutputEvent = z.infer<
  typeof TablesQueryModelOutputEventSchema
>;

const TablesQueryOutputEventSchema = z.object({
  type: z.literal("tables_query_output"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: TablesQueryActionTypeSchema,
});
type TablesQueryOutputEvent = z.infer<typeof TablesQueryOutputEventSchema>;

const WebsearchParamsEventSchema = z.object({
  type: z.literal("websearch_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: WebsearchActionTypeSchema,
});
type WebsearchParamsEvent = z.infer<typeof WebsearchParamsEventSchema>;

export const AgentErrorEventSchema = z.object({
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

export const AgentActionSpecificEventSchema = z.union([
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

export const AgentActionSuccessEventSchema = z.object({
  type: z.literal("agent_action_success"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: AgentActionTypeSchema,
});
export type AgentActionSuccessEvent = z.infer<
  typeof AgentActionSuccessEventSchema
>;

export const AgentMessageSuccessEventSchema = z.object({
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

export const UserMessageErrorEventSchema = z.object({
  type: z.literal("user_message_error"),
  created: z.number(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type UserMessageErrorEvent = z.infer<typeof UserMessageErrorEventSchema>;

export const CoreAPIErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
});
export type CoreAPIError = z.infer<typeof CoreAPIErrorSchema>;

export const CoreAPITokenTypeSchema = z.tuple([z.number(), z.string()]);
export type CoreAPITokenType = z.infer<typeof CoreAPITokenTypeSchema>;

export const APIErrorTypeSchema = z.enum([
  "not_authenticated",
  "missing_authorization_header_error",
  "malformed_authorization_header_error",
  "invalid_api_key_error",
  "internal_server_error",
  "invalid_request_error",
  "invalid_rows_request_error",
  "user_not_found",
  "data_source_error",
  "data_source_not_found",
  "data_source_view_not_found",
  "data_source_auth_error",
  "data_source_quota_error",
  "data_source_document_not_found",
  "data_source_not_managed",
  "run_error",
  "app_not_found",
  "app_auth_error",
  "provider_auth_error",
  "provider_not_found",
  "dataset_not_found",
  "workspace_not_found",
  "workspace_auth_error",
  "workspace_user_not_found",
  "method_not_supported_error",
  "personal_workspace_not_found",
  "workspace_not_found",
  "action_unknown_error",
  "action_api_error",
  "membership_not_found",
  "invitation_not_found",
  "plan_limit_error",
  "template_not_found",
  "chat_message_not_found",
  "connector_not_found_error",
  "connector_update_error",
  "connector_update_unauthorized",
  "connector_oauth_target_mismatch",
  "connector_provider_not_supported",
  "connector_credentials_error",
  "agent_configuration_not_found",
  "agent_message_error",
  "message_not_found",
  "plan_message_limit_exceeded",
  "global_agent_error",
  "stripe_invalid_product_id_error",
  "rate_limit_error",
  "subscription_payment_failed",
  "subscription_not_found",
  "subscription_state_invalid",
  "assistant_saving_error",
  "unexpected_error_format",
  "unexpected_response_format",
  "unexpected_network_error",
  "action_failed",
  "unexpected_action_response",
  "feature_flag_not_found",
  "feature_flag_already_exists",
  "invalid_pagination_parameters",
  "table_not_found",
  "template_not_found",
  "invitation_already_sent_recently",
  "dust_app_secret_not_found",
  "key_not_found",
  "transcripts_configuration_not_found",
  "transcripts_configuration_default_not_allowed",
  "transcripts_configuration_already_exists",
  "file_not_found",
  "file_too_large",
  "file_type_not_supported",
  "run_not_found",
  "vault_already_exists",
  "vault_not_found",
  "group_not_found",
  "plugin_not_found",
  "plugin_execution_failed",
  "conversation_not_found",
  "conversation_access_restricted",
]);
export type APIErrorType = z.infer<typeof APIErrorTypeSchema>;

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
export type WorkspaceDomain = z.infer<typeof WorkspaceDomainSchema>;

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
  groupIds?: string[];
  userEmail?: string;
};

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

export const SearchDataSourceViewsResponseSchema = z.object({
  data_source_views: DataSourceViewSchema.array(),
});

export type SearchDataSourceViewsResponseType = z.infer<
  typeof SearchDataSourceViewsResponseSchema
>;

export const PatchDataSourceViewsResponseSchema = z.object({
  data_source_views: DataSourceViewSchema.array(),
});

export type PatchDataSourceViewsReponseType = z.infer<
  typeof PatchDataSourceViewsResponseSchema
>;
