import moment from "moment-timezone";
import { z } from "zod";

import { INTERNAL_MIME_TYPES_VALUES } from "./internal_mime_types";

type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

// Custom schema to get a string literal type and yet allow any string when parsing
const FlexibleEnumSchema = <T extends string>() =>
  z.custom<StringLiteral<T>>((val) => {
    return typeof val === "string";
  });

const ModelProviderIdSchema = FlexibleEnumSchema<
  | "openai"
  | "anthropic"
  | "mistral"
  | "google_ai_studio"
  | "togetherai"
  | "deepseek"
  | "fireworks"
>();

const ModelLLMIdSchema = FlexibleEnumSchema<
  | "gpt-3.5-turbo"
  | "gpt-4-turbo"
  | "gpt-4o-2024-08-06"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "o1"
  | "o1-mini"
  | "o3-mini"
  | "claude-3-opus-20240229"
  | "claude-3-5-sonnet-20240620"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-7-sonnet-20250219"
  | "claude-3-5-haiku-20241022"
  | "claude-3-haiku-20240307"
  | "claude-2.1"
  | "claude-instant-1.2"
  | "mistral-large-latest"
  | "mistral-medium"
  | "mistral-small-latest"
  | "codestral-latest"
  | "gemini-1.5-pro-latest"
  | "gemini-1.5-flash-latest"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite"
  | "gemini-2.5-pro-exp-03-25"
  | "gemini-2.0-flash-exp" // DEPRECATED
  | "gemini-2.0-flash-lite-preview-02-05" // DEPRECATED
  | "gemini-2.0-pro-exp-02-05" // DEPRECATED
  | "gemini-2.0-flash-thinking-exp-01-21" // DEPRECATED
  | "meta-llama/Llama-3.3-70B-Instruct-Turbo" // togetherai
  | "Qwen/Qwen2.5-Coder-32B-Instruct" // togetherai
  | "Qwen/QwQ-32B-Preview" // togetherai
  | "Qwen/Qwen2-72B-Instruct" // togetherai
  | "deepseek-ai/DeepSeek-V3" // togetherai
  | "deepseek-ai/DeepSeek-R1" // togetherai
  | "deepseek-chat" // deepseek api
  | "deepseek-reasoner" // deepseek api
  | "accounts/fireworks/models/deepseek-r1" // fireworks
>();

const EmbeddingProviderIdSchema = FlexibleEnumSchema<"openai" | "mistral">();

const ConnectorsAPIErrorTypeSchema = FlexibleEnumSchema<
  | "authorization_error"
  | "not_found"
  | "internal_server_error"
  | "unexpected_error_format"
  | "unexpected_response_format"
  | "unexpected_network_error"
  | "unknown_connector_provider"
  | "invalid_request_error"
  | "connector_authorization_error"
  | "connector_not_found"
  | "connector_configuration_not_found"
  | "connector_update_error"
  | "connector_update_unauthorized"
  | "connector_oauth_target_mismatch"
  | "connector_oauth_error"
  | "slack_channel_not_found"
  | "connector_rate_limit_error"
  | "slack_configuration_not_found"
  | "google_drive_webhook_not_found"
>();

const ConnectorsAPIErrorSchema = z.object({
  type: ConnectorsAPIErrorTypeSchema,
  message: z.string(),
});

export type ConnectorsAPIError = z.infer<typeof ConnectorsAPIErrorSchema>;

const ModelIdSchema = z.number();

export type ConnectorsAPIErrorType = z.infer<
  typeof ConnectorsAPIErrorTypeSchema
>;

export function isConnectorsAPIError(obj: unknown): obj is ConnectorsAPIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "type" in obj &&
    typeof obj.type === "string" &&
    ConnectorsAPIErrorSchema.safeParse(obj).success
  );
}

// Supported content types that are plain text and can be sent as file-less content fragment.
export const supportedOtherFileFormats = {
  "application/msword": [".doc", ".docx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".doc",
    ".docx",
  ],
  "application/vnd.ms-powerpoint": [".ppt", ".pptx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".ppt",
    ".pptx",
  ],
  "application/vnd.google-apps.document": [],
  "application/vnd.google-apps.presentation": [],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.google-apps.spreadsheet": [],
  "application/vnd.ms-excel": [".xls"],
  "application/pdf": [".pdf"],
  "application/vnd.dust.section.json": [".json"],
  "text/comma-separated-values": [".csv"],
  "text/csv": [".csv"],
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt", ".log", ".cfg", ".conf"],
  "text/tab-separated-values": [".tsv"],
  "text/tsv": [".tsv"],
  "text/vnd.dust.attachment.slack.thread": [".txt"],
  "text/html": [".html", ".htm", ".xhtml", ".xhtml+xml"],
  "text/xml": [".xml"],
  "text/calendar": [".ics"],
  "text/css": [".css"],
  "text/javascript": [".js", ".mjs", ".jsx"],
  "text/typescript": [".ts", ".tsx"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  "application/x-sh": [".sh"],
  "text/x-sh": [".sh"],
  "text/x-python": [".py"],
  "text/x-python-script": [".py"],
  "application/x-yaml": [".yaml", ".yml"],
  "text/yaml": [".yaml", ".yml"],
  "text/vnd.yaml": [".yaml", ".yml"],
  "text/x-c": [".c", ".cc", ".cpp", ".cxx", ".dic", ".h", ".hh"],
  "text/x-csharp": [".cs"],
  "text/x-java-source": [".java"],
  "text/x-php": [".php"],
  "text/x-ruby": [".rb"],
  "text/x-sql": [".sql"],
  "text/x-swift": [".swift"],
  "text/x-rust": [".rs"],
  "text/x-go": [".go"],
  "text/x-kotlin": [".kt", ".kts"],
  "text/x-scala": [".scala"],
  "text/x-groovy": [".groovy"],
  "text/x-perl": [".pl", ".pm"],
  "text/x-perl-script": [".pl", ".pm"],
} as const;

// Supported content types for images.
export const supportedImageFileFormats = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
} as const;

type OtherContentType = keyof typeof supportedOtherFileFormats;
type ImageContentType = keyof typeof supportedImageFileFormats;

const supportedOtherContentTypes = Object.keys(
  supportedOtherFileFormats
) as OtherContentType[];
const supportedImageContentTypes = Object.keys(
  supportedImageFileFormats
) as ImageContentType[];

export const supportedFileExtensions = [
  ...Object.keys(supportedOtherFileFormats),
  ...Object.keys(supportedImageFileFormats),
];

export type SupportedFileContentType = OtherContentType | ImageContentType;
const supportedUploadableContentType = [
  ...supportedOtherContentTypes,
  ...supportedImageContentTypes,
] as SupportedFileContentType[];

const SupportedContentFragmentTypeSchema = FlexibleEnumSchema<
  | keyof typeof supportedOtherFileFormats
  | keyof typeof supportedImageFileFormats
  | (typeof INTERNAL_MIME_TYPES_VALUES)[number]
  // Legacy content types still retuned by the API when rendering old messages.
  | "dust-application/slack"
>();

const SupportedFileContentFragmentTypeSchema = FlexibleEnumSchema<
  | keyof typeof supportedOtherFileFormats
  | keyof typeof supportedImageFileFormats
>();

export function isSupportedFileContentType(
  contentType: string
): contentType is SupportedFileContentType {
  return supportedUploadableContentType.includes(
    contentType as SupportedFileContentType
  );
}

export function isSupportedPlainTextContentType(
  contentType: string
): contentType is OtherContentType {
  return supportedOtherContentTypes.includes(contentType as OtherContentType);
}

export function isSupportedImageContentType(
  contentType: string
): contentType is ImageContentType {
  return supportedImageContentTypes.includes(contentType as ImageContentType);
}

const UserMessageOriginSchema = FlexibleEnumSchema<
  | "slack"
  | "web"
  | "api"
  | "gsheet"
  | "zapier"
  | "n8n"
  | "make"
  | "zendesk"
  | "raycast"
  | "github-copilot-chat"
  | "extension"
  | "email"
>()
  .or(z.null())
  .or(z.undefined());

const VisibilitySchema = FlexibleEnumSchema<"visible" | "deleted">();

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

const ConnectorProvidersSchema = FlexibleEnumSchema<
  | "confluence"
  | "github"
  | "google_drive"
  | "intercom"
  | "notion"
  | "slack"
  | "microsoft"
  | "webcrawler"
  | "snowflake"
  | "zendesk"
  | "bigquery"
  | "salesforce"
  | "gong"
>();
export type ConnectorProvider = z.infer<typeof ConnectorProvidersSchema>;

export const isConnectorProvider = (
  provider: string
): provider is ConnectorProvider =>
  ConnectorProvidersSchema.safeParse(provider).success;

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

export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

export function isFolder(
  ds: DataSourceType
): ds is DataSourceType & { connectorProvider: null } {
  // If there is no connectorProvider, it's a folder.
  return !ds.connectorProvider;
}

export function isWebsite(
  ds: DataSourceType
): ds is DataSourceType & { connectorProvider: "webcrawler" } {
  return ds.connectorProvider === "webcrawler";
}

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
  parent_id: z.string().nullable().optional(),
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

export type CoreAPIRowType = z.infer<typeof CoreAPIRowSchema>;

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
  parent_id: z.string().nullable().optional(),
  mime_type: z.string().optional(),
  title: z.string().optional(),
});

export type CoreAPITablePublic = z.infer<typeof CoreAPITablePublicSchema>;

export interface LoggerInterface {
  error: (args: Record<string, unknown>, message: string) => void;
  info: (args: Record<string, unknown>, message: string) => void;
  trace: (args: Record<string, unknown>, message: string) => void;
  warn: (args: Record<string, unknown>, message: string) => void;
}

const DataSourceViewCategoriesSchema = FlexibleEnumSchema<
  "managed" | "folder" | "website" | "apps"
>();

const BlockTypeSchema = FlexibleEnumSchema<
  | "input"
  | "data"
  | "data_source"
  | "code"
  | "llm"
  | "chat"
  | "map"
  | "reduce"
  | "while"
  | "end"
  | "search"
  | "curl"
  | "browser"
  | "database_schema"
  | "database"
>();

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

const TokensClassificationSchema = FlexibleEnumSchema<
  "tokens" | "chain_of_thought"
>();

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

const BaseActionTypeSchema = FlexibleEnumSchema<
  | "dust_app_run_action"
  | "tables_query_action"
  | "retrieval_action"
  | "process_action"
  | "websearch_action"
  | "browse_action"
  | "reasoning_action"
  | "visualization_action"
>();

const BaseActionSchema = z.object({
  id: ModelIdSchema,
  type: BaseActionTypeSchema,
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

const BrowseActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  urls: z.array(z.string()),
  output: BrowseActionOutputSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("browse_action"),
});
type BrowseActionPublicType = z.infer<typeof BrowseActionTypeSchema>;

const SearchLabelsActionOutputSchema = z.object({
  tags: z.array(
    z.object({
      tag: z.string(),
      match_count: z.number(),
      data_sources: z.array(z.string()),
    })
  ),
});

const SearchLabelsActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  output: SearchLabelsActionOutputSchema.nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("search_labels_action"),
});
type SearchLabelsActionPublicType = z.infer<
  typeof SearchLabelsActionTypeSchema
>;

const ReasoningActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  output: z.string().nullable(),
  thinking: z.string().nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("reasoning_action"),
});
type ReasoningActionPublicType = z.infer<typeof ReasoningActionTypeSchema>;

const ConversationIncludeFileActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  params: z.object({
    fileId: z.string(),
  }),
  tokensCount: z.number().nullable(),
  fileTitle: z.string().nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  step: z.number(),
  type: z.literal("conversation_include_file_action"),
});

const ConversationAttachmentTypeSchema = z.union([
  // File case
  z.object({
    fileId: z.string(),
    contentFragmentId: z.undefined(),
    nodeDataSourceViewId: z.undefined(),
    title: z.string(),
    contentType: SupportedContentFragmentTypeSchema,
  }),
  // Node case
  z.object({
    fileId: z.undefined(),
    contentFragmentId: z.string(),
    nodeDataSourceViewId: z.string(),
    title: z.string(),
    contentType: SupportedContentFragmentTypeSchema,
  }),
]);

const ConversationListFilesActionTypeSchema = BaseActionSchema.extend({
  files: z.array(ConversationAttachmentTypeSchema),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  agentMessageId: ModelIdSchema,
  step: z.number(),
  type: z.literal("conversation_list_files_action"),
});

const DustAppParametersSchema = z.record(
  z.union([z.string(), z.number(), z.boolean()])
);

const DustAppRunActionTypeSchema = BaseActionSchema.extend({
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
}).transform((o) => ({
  ...o,
  output: o.output,
}));
type DustAppRunActionPublicType = z.infer<typeof DustAppRunActionTypeSchema>;

const DataSourceViewKindSchema = FlexibleEnumSchema<"default" | "custom">();

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
  spaceId: z.string(),
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

export type RetrievalDocumentPublicType = z.infer<
  typeof RetrievalDocumentTypeSchema
>;

const RetrievalActionTypeSchema = BaseActionSchema.extend({
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

export type RetrievalActionPublicType = z.infer<
  typeof RetrievalActionTypeSchema
>;

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
});

const ProcessActionTypeSchema = BaseActionSchema.extend({
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
type ProcessActionPublicType = z.infer<typeof ProcessActionTypeSchema>;

const TablesQueryActionTypeSchema = BaseActionSchema.extend({
  params: DustAppParametersSchema,
  output: z.record(z.union([z.string(), z.number(), z.boolean()])).nullable(),
  resultsFileId: z.string().nullable(),
  resultsFileSnippet: z.string().nullable(),
  sectionFileId: z.string().nullable(),
  functionCallId: z.string().nullable(),
  functionCallName: z.string().nullable(),
  agentMessageId: ModelIdSchema,
  step: z.number(),
  type: z.literal("tables_query_action"),
});
type TablesQueryActionPublicType = z.infer<typeof TablesQueryActionTypeSchema>;

const WhitelistableFeaturesSchema = FlexibleEnumSchema<
  | "usage_data_api"
  | "okta_enterprise_connection"
  | "labs_features"
  | "labs_transcripts"
  | "labs_connection_hubspot"
  | "labs_trackers"
  | "labs_github_actions"
  | "document_tracker"
  | "openai_o1_feature"
  | "openai_o1_mini_feature"
  | "openai_o1_high_reasoning_feature"
  | "openai_o1_custom_assistants_feature"
  | "openai_o1_high_reasoning_custom_assistants_feature"
  | "deepseek_feature"
  | "google_ai_studio_experimental_models_feature"
  | "snowflake_connector_feature"
  | "index_private_slack_channel"
  | "disable_run_logs"
  | "show_debug_tools"
  | "deepseek_r1_global_agent_feature"
  | "salesforce_feature"
  | "advanced_notion_management"
  | "search_knowledge_builder"
  | "force_gdrive_labels_scope"
  | "claude_3_7_reasoning"
  | "mcp_actions"
>();

export type WhitelistableFeature = z.infer<typeof WhitelistableFeaturesSchema>;

const WorkspaceSegmentationSchema =
  FlexibleEnumSchema<"interesting">().nullable();

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

export type LightWorkspaceType = z.infer<typeof LightWorkspaceSchema>;
export type WorkspaceType = z.infer<typeof WorkspaceSchema>;
export type ExtensionWorkspaceType = z.infer<typeof ExtensionWorkspaceSchema>;

const WorkspaceSchema = LightWorkspaceSchema.extend({
  ssoEnforced: z.boolean().optional(),
});

const ExtensionWorkspaceSchema = WorkspaceSchema.extend({
  blacklistedDomains: z.array(z.string()).nullable(),
});

const UserProviderSchema = FlexibleEnumSchema<
  "auth0" | "github" | "google" | "okta" | "samlp" | "waad"
>().nullable();

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

export type UserType = z.infer<typeof UserSchema>;

export const WebsearchResultSchema = z.object({
  title: z.string(),
  snippet: z.string(),
  link: z.string(),
  reference: z.string(),
});

export type WebsearchResultPublicType = z.infer<typeof WebsearchResultSchema>;

const WebsearchActionOutputSchema = z.union([
  z.object({
    results: z.array(WebsearchResultSchema),
  }),
  z.object({
    results: z.array(WebsearchResultSchema),
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

export type WebsearchActionPublicType = z.infer<
  typeof WebsearchActionTypeSchema
>;

const MCPActionTypeSchema = BaseActionSchema.extend({
  agentMessageId: ModelIdSchema,
  params: z.unknown(),
  type: z.literal("tool_action"),
});

const GlobalAgentStatusSchema = FlexibleEnumSchema<
  | "active"
  | "disabled_by_admin"
  | "disabled_missing_datasource"
  | "disabled_free_workspace"
>();

const AgentStatusSchema = FlexibleEnumSchema<"active" | "archived" | "draft">();

const AgentConfigurationStatusSchema = z.union([
  AgentStatusSchema,
  GlobalAgentStatusSchema,
]);

const AgentConfigurationScopeSchema = FlexibleEnumSchema<
  "global" | "workspace" | "published" | "private"
>();

export const AgentConfigurationViewSchema = FlexibleEnumSchema<
  "all" | "list" | "workspace" | "published" | "global" | "favorites"
>();

export type AgentConfigurationViewType = z.infer<
  typeof AgentConfigurationViewSchema
>;

const AgentUsageTypeSchema = z.object({
  messageCount: z.number(),
  conversationCount: z.number(),
  userCount: z.number(),
  timePeriodSec: z.number(),
});

const AgentRecentAuthorsSchema = z.array(z.string()).readonly();

const AgentModelConfigurationSchema = z.object({
  providerId: ModelProviderIdSchema,
  modelId: ModelLLMIdSchema,
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
  userFavorite: z.boolean(),
  name: z.string(),
  description: z.string(),
  pictureUrl: z.string(),
  lastAuthors: AgentRecentAuthorsSchema.optional(),
  usage: AgentUsageTypeSchema.optional(),
  maxStepsPerRun: z.number(),
  visualizationEnabled: z.boolean(),
  templateId: z.string().nullable(),
  groupIds: z.array(z.string()).optional(),
  requestedGroupIds: z.array(z.array(z.string())),
});

export type LightAgentConfigurationType = z.infer<
  typeof LightAgentConfigurationSchema
>;

const ContentFragmentContextSchema = z.object({
  username: z.string().optional().nullable(),
  fullName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  profilePictureUrl: z.string().optional().nullable(),
});

const ContentFragmentSchema = z.object({
  id: ModelIdSchema,
  sId: z.string(),
  fileId: z.string().nullable(),
  created: z.number(),
  type: z.literal("content_fragment"),
  visibility: VisibilitySchema,
  version: z.number(),
  sourceUrl: z.string().nullable(),
  textUrl: z.string(),
  textBytes: z.number().nullable(),
  title: z.string(),
  contentType: SupportedContentFragmentTypeSchema,
  context: ContentFragmentContextSchema,
  contentFragmentId: z.string(),
  contentFragmentVersion: z.union([
    z.literal("latest"),
    z.literal("superseded"),
  ]),
});
export type ContentFragmentType = z.infer<typeof ContentFragmentSchema>;

export type UploadedContentFragmentType = {
  fileId: string;
  title: string;
  url?: string;
};

const AgentMentionSchema = z.object({
  configurationId: z.string(),
});

export type AgentMentionType = z.infer<typeof AgentMentionSchema>;

const UserMessageContextSchema = z.object({
  username: z.string(),
  timezone: Timezone,
  fullName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  profilePictureUrl: z.string().optional().nullable(),
  origin: UserMessageOriginSchema,
});

const UserMessageSchema = z.object({
  id: ModelIdSchema,
  created: z.number(),
  type: z.literal("user_message"),
  sId: z.string(),
  visibility: VisibilitySchema,
  version: z.number(),
  user: UserSchema.nullable(),
  mentions: z.array(AgentMentionSchema),
  content: z.string(),
  context: UserMessageContextSchema,
});
export type UserMessageType = z.infer<typeof UserMessageSchema>;

const UserMessageWithRankTypeSchema = UserMessageSchema.and(RankSchema);

export type UserMessageWithRankType = z.infer<
  typeof UserMessageWithRankTypeSchema
>;

const AgentActionTypeSchema = z.union([
  RetrievalActionTypeSchema,
  DustAppRunActionTypeSchema,
  TablesQueryActionTypeSchema,
  ProcessActionTypeSchema,
  WebsearchActionTypeSchema,
  BrowseActionTypeSchema,
  ConversationListFilesActionTypeSchema,
  ConversationIncludeFileActionTypeSchema,
  ReasoningActionTypeSchema,
  SearchLabelsActionTypeSchema,
  MCPActionTypeSchema,
]);
export type AgentActionPublicType = z.infer<typeof AgentActionTypeSchema>;

const AgentMessageStatusSchema = FlexibleEnumSchema<
  "created" | "succeeded" | "failed" | "cancelled"
>();

const AgentMessageTypeSchema = z.object({
  id: ModelIdSchema,
  agentMessageId: ModelIdSchema,
  created: z.number(),
  type: z.literal("agent_message"),
  sId: z.string(),
  visibility: VisibilitySchema,
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
export type AgentMessagePublicType = z.infer<typeof AgentMessageTypeSchema>;

const AgentMesssageFeedbackSchema = z.object({
  messageId: z.string(),
  agentMessageId: z.number(),
  userId: z.number(),
  thumbDirection: z.union([z.literal("up"), z.literal("down")]),
  content: z.string().nullable(),
  createdAt: z.number(),
  agentConfigurationId: z.string(),
  agentConfigurationVersion: z.number(),
  isConversationShared: z.boolean(),
});

const ConversationVisibilitySchema = FlexibleEnumSchema<
  "unlisted" | "workspace" | "deleted" | "test"
>();

export type ConversationVisibility = z.infer<
  typeof ConversationVisibilitySchema
>;

const ConversationWithoutContentSchema = z.object({
  id: ModelIdSchema,
  created: z.number(),
  updated: z.number().optional(),
  owner: WorkspaceSchema,
  sId: z.string(),
  title: z.string().nullable(),
  visibility: ConversationVisibilitySchema,
  groupIds: z.array(z.string()).optional(),
  requestedGroupIds: z.array(z.array(z.string())),
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

export type ConversationWithoutContentPublicType = z.infer<
  typeof ConversationWithoutContentSchema
>;
export type ConversationPublicType = z.infer<typeof ConversationSchema>;

const ConversationMessageReactionsSchema = z.array(
  z.object({
    messageId: z.string(),
    reactions: z.array(
      z.object({
        emoji: z.string(),
        users: z.array(
          z.object({
            userId: ModelIdSchema.nullable(),
            username: z.string(),
            fullName: z.string().nullable(),
          })
        ),
      })
    ),
  })
);

export type ConversationMessageReactionsType = z.infer<
  typeof ConversationMessageReactionsSchema
>;

const BrowseParamsEventSchema = z.object({
  type: z.literal("browse_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: BrowseActionTypeSchema,
});

const ConversationIncludeFileParamsEventSchema = z.object({
  type: z.literal("conversation_include_file_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: ConversationIncludeFileActionTypeSchema,
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

const ReasoningStartedEventSchema = z.object({
  type: z.literal("reasoning_started"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: ReasoningActionTypeSchema,
});

const ReasoningThinkingEventSchema = z.object({
  type: z.literal("reasoning_thinking"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: ReasoningActionTypeSchema,
});

const ReasoningTokensEventSchema = z.object({
  type: z.literal("reasoning_tokens"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: ReasoningActionTypeSchema,
  content: z.string(),
  classification: TokensClassificationSchema,
});

const SearchLabelsParamsEventSchema = z.object({
  type: z.literal("search_labels_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: SearchLabelsActionTypeSchema,
});

const MCPParamsEventSchema = z.object({
  type: z.literal("tool_params"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: MCPActionTypeSchema,
});

const MCPApproveExecutionEventSchema = z.object({
  type: z.literal("tool_approve_execution"),
  created: z.number(),
  configurationId: z.string(),
  messageId: z.string(),
  action: MCPActionTypeSchema,
  inputs: z.record(z.any()),
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
  BrowseParamsEventSchema,
  ConversationIncludeFileParamsEventSchema,
  DustAppRunBlockEventSchema,
  DustAppRunParamsEventSchema,
  ProcessParamsEventSchema,
  ReasoningStartedEventSchema,
  ReasoningThinkingEventSchema,
  ReasoningTokensEventSchema,
  RetrievalParamsEventSchema,
  SearchLabelsParamsEventSchema,
  TablesQueryModelOutputEventSchema,
  TablesQueryOutputEventSchema,
  TablesQueryStartedEventSchema,
  WebsearchParamsEventSchema,
  MCPParamsEventSchema,
  MCPApproveExecutionEventSchema,
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

export type CoreAPIError = z.infer<typeof CoreAPIErrorSchema>;

export const CoreAPITokenTypeSchema = z.tuple([z.number(), z.string()]);
export type CoreAPITokenType = z.infer<typeof CoreAPITokenTypeSchema>;

const APIErrorTypeSchema = FlexibleEnumSchema<
  | "action_api_error"
  | "action_failed"
  | "action_unknown_error"
  | "agent_configuration_not_found"
  | "agent_message_error"
  | "app_auth_error"
  | "app_not_found"
  | "assistant_saving_error"
  | "chat_message_not_found"
  | "connector_credentials_error"
  | "connector_not_found_error"
  | "connector_oauth_target_mismatch"
  | "connector_provider_not_supported"
  | "connector_update_error"
  | "connector_update_unauthorized"
  | "content_too_large"
  | "conversation_access_restricted"
  | "conversation_not_found"
  | "data_source_auth_error"
  | "data_source_document_not_found"
  | "data_source_error"
  | "data_source_not_found"
  | "data_source_not_managed"
  | "data_source_quota_error"
  | "data_source_view_not_found"
  | "dataset_not_found"
  | "dust_app_secret_not_found"
  | "expired_oauth_token_error"
  | "feature_flag_already_exists"
  | "feature_flag_not_found"
  | "file_not_found"
  | "file_too_large"
  | "file_type_not_supported"
  | "global_agent_error"
  | "group_not_found"
  | "internal_server_error"
  | "invalid_api_key_error"
  | "invalid_oauth_token_error"
  | "invalid_pagination_parameters"
  | "invalid_request_error"
  | "invalid_rows_request_error"
  | "invitation_already_sent_recently"
  | "invitation_not_found"
  | "key_not_found"
  | "malformed_authorization_header_error"
  | "membership_not_found"
  | "message_not_found"
  | "method_not_supported_error"
  | "missing_authorization_header_error"
  | "not_authenticated"
  | "personal_workspace_not_found"
  | "plan_limit_error"
  | "plan_message_limit_exceeded"
  | "plugin_execution_failed"
  | "plugin_not_found"
  | "provider_auth_error"
  | "provider_not_found"
  | "rate_limit_error"
  | "run_error"
  | "run_not_found"
  | "space_already_exists"
  | "space_not_found"
  | "stripe_invalid_product_id_error"
  | "subscription_not_found"
  | "subscription_payment_failed"
  | "subscription_state_invalid"
  | "table_not_found"
  | "template_not_found"
  | "template_not_found"
  | "transcripts_configuration_already_exists"
  | "transcripts_configuration_default_not_allowed"
  | "transcripts_configuration_not_found"
  | "unexpected_action_response"
  | "unexpected_error_format"
  | "unexpected_network_error"
  | "unexpected_response_format"
  | "user_not_found"
  | "workspace_auth_error"
  | "workspace_not_found"
  | "workspace_not_found"
  | "workspace_user_not_found"
>();

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

export type WorkspaceDomainType = z.infer<typeof WorkspaceDomainSchema>;

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
  apiKey: string | (() => string | null | Promise<string | null>);
  workspaceId: string;
  extraHeaders?: Record<string, string>;
};

const SpaceKindSchema = FlexibleEnumSchema<
  "regular" | "global" | "system" | "public" | "conversations"
>();

const SpaceTypeSchema = z.object({
  createdAt: z.number(),
  groupIds: z.array(z.string()),
  isRestricted: z.boolean(),
  kind: SpaceKindSchema,
  name: z.string(),
  sId: z.string(),
  updatedAt: z.number(),
});

export type SpaceType = z.infer<typeof SpaceTypeSchema>;

const DatasetSchemaEntryType = FlexibleEnumSchema<
  "string" | "number" | "boolean" | "json"
>();

const DatasetSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  data: z.array(z.record(z.any())).nullable().optional(),
  schema: z
    .array(
      z.object({
        key: z.string(),
        type: DatasetSchemaEntryType,
        description: z.string().nullable(),
      })
    )
    .nullable()
    .optional(),
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
  space: SpaceTypeSchema,
  datasets: z.array(DatasetSchema).optional(),
  coreSpecifications: z.record(z.string()).optional(),
});

export type ApiAppType = z.infer<typeof AppTypeSchema>;

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

export const GetOrPatchAgentConfigurationResponseSchema = z.object({
  agentConfiguration: LightAgentConfigurationSchema,
});

export type GetOrPatchAgentConfigurationResponseType = z.infer<
  typeof GetOrPatchAgentConfigurationResponseSchema
>;

export const PatchAgentConfigurationRequestSchema = z.object({
  userFavorite: z.boolean().optional(),
});

export type PatchAgentConfigurationRequestType = z.infer<
  typeof PatchAgentConfigurationRequestSchema
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

export const GetFeedbacksResponseSchema = z.object({
  feedbacks: z.array(AgentMesssageFeedbackSchema),
});

export type GetFeedbacksResponseType = z.infer<
  typeof GetFeedbacksResponseSchema
>;

export const PublicPostMessageFeedbackRequestBodySchema = z.object({
  thumbDirection: z.string(),
  feedbackContent: z.string().nullable().optional(),
  isConversationShared: z.boolean().optional(),
});

export type PublicPostMessageFeedbackRequestBody = z.infer<
  typeof PublicPostMessageFeedbackRequestBodySchema
>;

export const PostMessageFeedbackResponseSchema = z.object({
  success: z.literal(true),
});

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

export const PublicPostMessagesRequestBodySchema = z.intersection(
  z.object({
    content: z.string().min(1),
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
  agentMessages?: AgentMessagePublicType[];
};

export const PublicPostEditMessagesRequestBodySchema = z.object({
  content: z.string(),
  mentions: z.array(
    z.object({
      configurationId: z.string(),
    })
  ),
});

export type PublicPostEditMessagesRequestBody = z.infer<
  typeof PublicPostEditMessagesRequestBodySchema
>;

export const PublicContentFragmentWithContentSchema = z.object({
  title: z.string(),
  url: z.string().optional().nullable(),
  content: z.string(),
  contentType: z.string(),
  fileId: z.undefined().nullable(),
  nodeId: z.undefined().nullable(),
  nodeDataSourceViewId: z.undefined().nullable(),
  context: ContentFragmentContextSchema.optional().nullable(),
  // Undocumented for now -- allows to supersede an existing content fragment.
  supersededContentFragmentId: z.string().optional().nullable(),
});

export type PublicContentFragmentWithContent = z.infer<
  typeof PublicContentFragmentWithContentSchema
>;

export const PublicContentFragmentWithFileIdSchema = z.object({
  title: z.string(),
  fileId: z.string(),
  url: z.string().optional().nullable(),
  content: z.undefined().nullable(),
  contentType: z.undefined().nullable(),
  nodeId: z.undefined().nullable(),
  nodeDataSourceViewId: z.undefined().nullable(),
  context: ContentFragmentContextSchema.optional().nullable(),
  // Undocumented for now -- allows to supersede an existing content fragment.
  supersededContentFragmentId: z.string().optional().nullable(),
});

export type PublicContentFragmentWithFileId = z.infer<
  typeof PublicContentFragmentWithFileIdSchema
>;

const PublicContentFragmentWithContentNodeSchema = z.object({
  title: z.string(),
  nodeId: z.string(),
  nodeDataSourceViewId: z.string(),
  url: z.undefined().nullable(),
  content: z.undefined().nullable(),
  contentType: z.undefined().nullable(),
  fileId: z.undefined().nullable(),
  context: ContentFragmentContextSchema.optional().nullable(),
  supersededContentFragmentId: z.string().optional().nullable(),
});

export const PublicPostContentFragmentRequestBodySchema = z.union([
  PublicContentFragmentWithContentSchema,
  PublicContentFragmentWithFileIdSchema,
  PublicContentFragmentWithContentNodeSchema,
]);

export type PublicPostContentFragmentRequestBody = z.infer<
  typeof PublicPostContentFragmentRequestBodySchema
>;

export const PublicPostConversationsRequestBodySchema = z.intersection(
  z.object({
    title: z.string().nullable().optional(),
    visibility: z
      .enum(["unlisted", "workspace", "deleted", "test"])
      .optional()
      .default("unlisted"),
    message: z.union([
      z.intersection(
        z.object({
          content: z.string().min(1),
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
      PublicContentFragmentWithContentSchema,
      PublicContentFragmentWithFileIdSchema,
      PublicContentFragmentWithContentNodeSchema,
      z.undefined(),
    ]),
    contentFragments: z.union([
      z
        .union([
          PublicContentFragmentWithContentSchema,
          PublicContentFragmentWithFileIdSchema,
          PublicContentFragmentWithContentNodeSchema,
        ])
        .array(),
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

export const GetConversationsResponseSchema = z.object({
  conversations: ConversationWithoutContentSchema.array(),
});
export type GetConversationsResponseType = z.infer<
  typeof GetConversationsResponseSchema
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

export const GetAppsResponseSchema = z.object({
  apps: AppTypeSchema.array(),
});

export const PostAppsRequestSchema = z.object({
  apps: AppTypeSchema.array(),
});

export type GetAppsResponseType = z.infer<typeof GetAppsResponseSchema>;

export const ImportAppsResponseSchema = z.object({
  apps: z
    .object({
      sId: z.string(),
      name: z.string(),
      error: z.string().optional(),
    })
    .array(),
});

export type ImportAppsResponseType = z.infer<typeof ImportAppsResponseSchema>;

export const DataSourceViewResponseSchema = z.object({
  dataSourceView: DataSourceViewSchema,
});

export type DataSourceViewResponseType = z.infer<
  typeof DataSourceViewResponseSchema
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
  top_k: z.coerce.number(),
  full_text: z.coerce.boolean(),
  target_document_tokens: z.coerce.number().optional(),
  timestamp_gt: z.coerce.number().optional(),
  timestamp_lt: z.coerce.number().optional(),
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
  parent_id: z.string().nullable().optional(),
  parents: z.array(z.string()).nullable().optional(),
  source_url: z.string().nullable().optional(),
  upsert_context: z
    .object({
      sync_type: z.union([z.enum(["batch", "incremental"]), z.undefined()]),
    }) // For the fields to be not optional, see https://stackoverflow.com/questions/71477015/specify-a-zod-schema-with-a-non-optional-but-possibly-undefined-field
    .transform((o) => ({
      sync_type: o.sync_type,
    }))
    .optional(),
  text: z.string().nullable().optional(),
  section: FrontDataSourceDocumentSectionSchema.nullable().optional(),
  light_document_output: z.boolean().optional(),
  async: z.boolean().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

export type PostDataSourceDocumentRequestType = z.infer<
  typeof PostDataSourceDocumentRequestSchema
>;

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
  parent_id: z.string().nullable().optional(),
  parents: z.array(z.string()),
});

const PostTableParentsResponseSchema = z.object({
  updated: z.literal(true),
});
export type PostTableParentsResponseType = z.infer<
  typeof PostTableParentsResponseSchema
>;

export const UpsertTableFromCsvRequestSchema = z.object({
  name: z.string(),
  description: z.string(),
  timestamp: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  parentId: z.string().nullable().optional(),
  parents: z.array(z.string()).nullable().optional(),
  truncate: z.boolean(),
  async: z.boolean().optional(),
  title: z.string(),
  mimeType: z.string(),
  sourceUrl: z.string().nullable().optional(),
  tableId: z.string(),
  fileId: z.string(),
});

export type UpsertTableFromCsvRequestType = z.infer<
  typeof UpsertTableFromCsvRequestSchema
>;

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
  parent_id: z.string().nullable().optional(),
  parents: z.array(z.string()).nullable().optional(),
  remote_database_table_id: z.string().nullable().optional(),
  remote_database_secret_id: z.string().nullable().optional(),
  title: z.string(),
  mime_type: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
});

export type UpsertDatabaseTableRequestType = z.infer<
  typeof UpsertDatabaseTableRequestSchema
>;

const UpsertTableResponseSchema = z.object({
  table: CoreAPITablePublicSchema,
});
export type UpsertTableResponseType = z.infer<typeof UpsertTableResponseSchema>;

const SupportedUsageTablesSchema = FlexibleEnumSchema<
  | "users"
  | "assistant_messages"
  | "builders"
  | "assistants"
  | "feedbacks"
  | "all"
>();

export type UsageTableType = z.infer<typeof SupportedUsageTablesSchema>;

// Folders
const CoreAPIFolderSchema = z.object({
  data_source_id: z.string(),
  folder_id: z.string(),
  title: z.string(),
  parents: z.array(z.string()),
  timestamp: z.number(),
});

export const GetFoldersResponseSchema = z.object({
  folders: z.array(CoreAPIFolderSchema),
  total: z.number(),
});
export type GetFoldersResponseType = z.infer<typeof GetFoldersResponseSchema>;

export const GetFolderResponseSchema = z.object({
  folder: CoreAPIFolderSchema,
});
export type GetFolderResponseType = z.infer<typeof GetFolderResponseSchema>;

export const DeleteFolderResponseSchema = z.object({
  folder: z.object({
    folder_id: z.string(),
  }),
});
export type DeleteFolderResponseType = z.infer<
  typeof DeleteFolderResponseSchema
>;
export const UpsertFolderResponseSchema = z.object({
  folder: CoreAPIFolderSchema,
  data_source: DataSourceTypeSchema,
});
export type UpsertFolderResponseType = z.infer<
  typeof UpsertFolderResponseSchema
>;

const ProviderVisibilitySchema = FlexibleEnumSchema<"public" | "private">();

export const UpsertDataSourceFolderRequestSchema = z.object({
  timestamp: z.number(),
  parents: z.array(z.string()).nullable().optional(),
  parent_id: z.string().nullable().optional(),
  title: z.string(),
  mime_type: z.string(),
  source_url: z.string().nullable().optional(),
  provider_visibility: ProviderVisibilitySchema.nullable().optional(),
});
export type UpsertDataSourceFolderRequestType = z.infer<
  typeof UpsertDataSourceFolderRequestSchema
>;

const DateSchema = z
  .string()
  .refine(
    (s): s is string => /^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/.test(s),
    "YYYY-MM or YYYY-MM-DD"
  );

export const GetWorkspaceUsageRequestSchema = z.union([
  z.object({
    start: DateSchema,
    end: z.undefined(),
    mode: z.literal("month"),
    table: SupportedUsageTablesSchema,
    format: z.enum(["csv", "json"]).optional().default("csv"),
  }),
  z.object({
    start: DateSchema,
    end: DateSchema,
    mode: z.literal("range"),
    table: SupportedUsageTablesSchema,
    format: z.enum(["csv", "json"]).optional().default("csv"),
  }),
]);

export type GetWorkspaceUsageRequestType = z.infer<
  typeof GetWorkspaceUsageRequestSchema
>;

export const FileUploadUrlRequestSchema = z.object({
  contentType: SupportedFileContentFragmentTypeSchema,
  fileName: z.string().max(4096, "File name must be less than 4096 characters"),
  fileSize: z.number(),
  useCase: z.union([z.literal("conversation"), z.literal("upsert_table")]),
  useCaseMetadata: z
    .object({
      conversationId: z.string(),
    })
    .optional(),
});
export type FileUploadUrlRequestType = z.infer<
  typeof FileUploadUrlRequestSchema
>;

const FileTypeStatusSchema = FlexibleEnumSchema<
  "created" | "failed" | "ready"
>();

const FileTypeUseCaseSchema = FlexibleEnumSchema<
  "conversation" | "avatar" | "tool_output" | "upsert_document" | "upsert_table"
>();

export const FileTypeSchema = z.object({
  // TODO(spolu): move this to ModelIdSchema
  id: z.string(),
  sId: z.string(),
  contentType: z.string(),
  downloadUrl: z.string().optional(),
  fileName: z.string(),
  fileSize: z.number(),
  status: FileTypeStatusSchema,
  uploadUrl: z.string().optional(),
  publicUrl: z.string().optional(),
  useCase: FileTypeUseCaseSchema,
});
export type FileType = z.infer<typeof FileTypeSchema>;

export const FileTypeWithUploadUrlSchema = FileTypeSchema.extend({
  uploadUrl: z.string(),
});

export const FileUploadRequestResponseSchema = z.object({
  file: FileTypeWithUploadUrlSchema,
});
export type FileUploadRequestResponseType = z.infer<
  typeof FileUploadRequestResponseSchema
>;
export const FileUploadedRequestResponseSchema = z.object({
  file: FileTypeSchema,
});
export type FileUploadedRequestResponseType = z.infer<
  typeof FileUploadedRequestResponseSchema
>;

export const MeResponseSchema = z.object({
  user: UserSchema.and(
    z.object({
      workspaces: WorkspaceSchema.array().or(ExtensionWorkspaceSchema.array()),
    })
  ),
});

export type MeResponseType = z.infer<typeof MeResponseSchema>;

export const CancelMessageGenerationResponseSchema = z.object({
  success: z.literal(true),
});

export type CancelMessageGenerationResponseType = z.infer<
  typeof CancelMessageGenerationResponseSchema
>;

export const CancelMessageGenerationRequestSchema = z.object({
  messageIds: z.array(z.string()),
});

export type CancelMessageGenerationRequestType = z.infer<
  typeof CancelMessageGenerationRequestSchema
>;

// Typeguards.

export function isRetrievalActionType(
  action: AgentActionPublicType
): action is RetrievalActionPublicType {
  return action.type === "retrieval_action";
}

export function isWebsearchActionType(
  action: AgentActionPublicType
): action is WebsearchActionPublicType {
  return action.type === "websearch_action";
}

export function isTablesQueryActionType(
  action: AgentActionPublicType
): action is TablesQueryActionPublicType {
  return action.type === "tables_query_action";
}

export function isDustAppRunActionType(
  action: AgentActionPublicType
): action is DustAppRunActionPublicType {
  return action.type === "dust_app_run_action";
}

export function isProcessActionType(
  action: AgentActionPublicType
): action is ProcessActionPublicType {
  return action.type === "process_action";
}

export function BrowseActionPublicType(
  action: AgentActionPublicType
): action is BrowseActionPublicType {
  return action.type === "browse_action";
}

export function isReasoningActionType(
  action: AgentActionPublicType
): action is ReasoningActionPublicType {
  return action.type === "reasoning_action";
}

export function isSearchLabelsActionType(
  action: AgentActionPublicType
): action is SearchLabelsActionPublicType {
  return action.type === "search_labels_action";
}

export function isAgentMention(arg: AgentMentionType): arg is AgentMentionType {
  return (arg as AgentMentionType).configurationId !== undefined;
}

export function assertNever(x: never): never {
  throw new Error(
    `${
      typeof x === "object" ? JSON.stringify(x) : x
    } is not of type never. This should never happen.`
  );
}

export function removeNulls<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((v): v is T => v !== null && v !== undefined);
}

type ConnectorProviderDocumentType =
  | Exclude<ConnectorProvider, "webcrawler">
  | "document";

export function getProviderFromRetrievedDocument(
  document: RetrievalDocumentPublicType
): ConnectorProviderDocumentType {
  if (document.dataSourceView) {
    if (document.dataSourceView.dataSource.connectorProvider === "webcrawler") {
      return "document";
    }
    return document.dataSourceView.dataSource.connectorProvider || "document";
  }
  return "document";
}

export function getTitleFromRetrievedDocument(
  document: RetrievalDocumentPublicType
): string {
  const provider = getProviderFromRetrievedDocument(document);

  if (provider === "slack") {
    for (const t of document.tags) {
      if (t.startsWith("channelName:")) {
        return `#${t.substring(12)}`;
      }
    }
  }

  for (const t of document.tags) {
    if (t.startsWith("title:")) {
      return t.substring(6);
    }
  }

  return document.documentId;
}

export const AppsCheckRequestSchema = z.object({
  apps: z.array(
    z.object({
      appId: z.string(),
      appHash: z.string(),
    })
  ),
});

export type AppsCheckRequestType = z.infer<typeof AppsCheckRequestSchema>;

export const AppsCheckResponseSchema = z.object({
  apps: z.array(
    z.object({
      appId: z.string(),
      appHash: z.string(),
      deployed: z.boolean(),
    })
  ),
});

export type AppsCheckResponseType = z.infer<typeof AppsCheckResponseSchema>;

export const GetSpacesResponseSchema = z.object({
  spaces: z.array(SpaceTypeSchema),
});

export type GetSpacesResponseType = z.infer<typeof GetSpacesResponseSchema>;

export const ContentNodeTypeSchema = z.union([
  z.literal("document"),
  z.literal("table"),
  z.literal("folder"),
]);

export const ContentNodesViewTypeSchema = z.union([
  z.literal("table"),
  z.literal("document"),
  z.literal("all"),
]);

export type ContentNodesViewType = z.infer<typeof ContentNodesViewTypeSchema>;

export const BaseSearchBodySchema = z.object({
  viewType: ContentNodesViewTypeSchema,
  spaceIds: z.array(z.string()),
  includeDataSources: z.boolean(),
  limit: z.number(),
});

const TextSearchBodySchema = z.intersection(
  BaseSearchBodySchema,
  z.object({
    query: z.string(),
    nodeIds: z.undefined().optional(),
  })
);

const NodeIdSearchBodySchema = z.intersection(
  BaseSearchBodySchema,
  z.object({
    nodeIds: z.array(z.string()),
    query: z.undefined().optional(),
  })
);

export const SearchRequestBodySchema = z.union([
  TextSearchBodySchema,
  NodeIdSearchBodySchema,
]);

export type SearchRequestBodyType = z.infer<typeof SearchRequestBodySchema>;

export const ContentNodeSchema = z.object({
  expandable: z.boolean(),
  internalId: z.string(),
  lastUpdatedAt: z.number().nullable(),
  mimeType: z.string(),
  // The direct parent ID of this content node
  parentInternalId: z.string().nullable(),
  // permission: ConnectorPermissionSchema,
  preventSelection: z.boolean().optional(),
  providerVisibility: ProviderVisibilitySchema.nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  title: z.string(),
  type: ContentNodeTypeSchema,
});

export type ContentNodeType = z.infer<typeof ContentNodeSchema>;

export const ContentNodeWithParentSchema = z.intersection(
  ContentNodeSchema,
  z.object({
    parentsInternalIds: z.array(z.string()).optional(),
    parentTitle: z.string().optional().nullable(),
  })
);

export const DataSourceContentNodeSchema = z.intersection(
  ContentNodeWithParentSchema,
  z.object({
    dataSource: DataSourceTypeSchema,
    dataSourceViews: DataSourceViewSchema.array(),
  })
);

export type DataSourceContentNodeType = z.infer<
  typeof DataSourceContentNodeSchema
>;

export const DataSourceViewContentNodeSchema = z.intersection(
  ContentNodeWithParentSchema,
  z.object({
    dataSourceView: DataSourceViewSchema,
  })
);

export type DataSourceViewContentNodeType = z.infer<
  typeof DataSourceViewContentNodeSchema
>;

export const SearchWarningCodeSchema = z.literal("truncated-query-clauses");

export type SearchWarningCode = z.infer<typeof SearchWarningCodeSchema>;

export const PostWorkspaceSearchResponseBodySchema = z.object({
  nodes: DataSourceContentNodeSchema.array(),
  warningCode: SearchWarningCodeSchema.optional().nullable(),
});

export type PostWorkspaceSearchResponseBodyType = z.infer<
  typeof PostWorkspaceSearchResponseBodySchema
>;

// TODO(mcp) move somewhere else as we'll need dynamic labels for MCP.
export const ACTION_RUNNING_LABELS: Record<
  AgentActionPublicType["type"],
  string
> = {
  browse_action: "Browsing page",
  conversation_include_file_action: "Reading file",
  conversation_list_files_action: "Listing files",
  dust_app_run_action: "Running App",
  process_action: "Extracting data",
  reasoning_action: "Reasoning",
  retrieval_action: "Searching data",
  search_labels_action: "Searching labels",
  tables_query_action: "Querying tables",
  websearch_action: "Searching the web",
  tool_action: "Calling MCP Server",
};
