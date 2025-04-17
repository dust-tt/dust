import moment from "moment-timezone";
import { z } from "zod";
// Custom schema to get a string literal type and yet allow any string when parsing
const FlexibleEnumSchema = () => z.custom((val) => {
    return typeof val === "string";
});
const ModelProviderIdSchema = FlexibleEnumSchema();
const ModelLLMIdSchema = FlexibleEnumSchema();
const EmbeddingProviderIdSchema = FlexibleEnumSchema();
const ConnectorsAPIErrorTypeSchema = FlexibleEnumSchema();
const ConnectorsAPIErrorSchema = z.object({
    type: ConnectorsAPIErrorTypeSchema,
    message: z.string(),
});
const ModelIdSchema = z.number();
export function isConnectorsAPIError(obj) {
    return (typeof obj === "object" &&
        obj !== null &&
        "message" in obj &&
        typeof obj.message === "string" &&
        "type" in obj &&
        typeof obj.type === "string" &&
        ConnectorsAPIErrorSchema.safeParse(obj).success);
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
};
// Supported content types for images.
export const supportedImageFileFormats = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
};
const supportedOtherContentTypes = Object.keys(supportedOtherFileFormats);
const supportedImageContentTypes = Object.keys(supportedImageFileFormats);
export const supportedFileExtensions = [
    ...Object.keys(supportedOtherFileFormats),
    ...Object.keys(supportedImageFileFormats),
];
const supportedUploadableContentType = [
    ...supportedOtherContentTypes,
    ...supportedImageContentTypes,
];
const SupportedContentFragmentTypeSchema = FlexibleEnumSchema();
const SupportedFileContentFragmentTypeSchema = FlexibleEnumSchema();
export function isSupportedFileContentType(contentType) {
    return supportedUploadableContentType.includes(contentType);
}
export function isSupportedPlainTextContentType(contentType) {
    return supportedOtherContentTypes.includes(contentType);
}
export function isSupportedImageContentType(contentType) {
    return supportedImageContentTypes.includes(contentType);
}
const UserMessageOriginSchema = FlexibleEnumSchema()
    .or(z.null())
    .or(z.undefined());
const VisibilitySchema = FlexibleEnumSchema();
const RankSchema = z.object({
    rank: z.number(),
});
export class Ok {
    constructor(value) {
        this.value = value;
    }
    isOk() {
        return true;
    }
    isErr() {
        return false;
    }
}
export class Err {
    constructor(error) {
        this.error = error;
    }
    isOk() {
        return false;
    }
    isErr() {
        return true;
    }
}
// Custom codec to validate the timezone
const Timezone = z.string().refine((s) => moment.tz.names().includes(s), {
    message: "Invalid timezone",
});
const ConnectorProvidersSchema = FlexibleEnumSchema();
export const isConnectorProvider = (provider) => ConnectorProvidersSchema.safeParse(provider).success;
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
export function isFolder(ds) {
    // If there is no connectorProvider, it's a folder.
    return !ds.connectorProvider;
}
export function isWebsite(ds) {
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
const CoreAPITableSchema = z.array(z.object({
    name: z.string(),
    value_type: z.enum(["int", "float", "text", "bool", "datetime"]),
    possible_values: z.array(z.string()).nullable().optional(),
}));
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
const DataSourceViewCategoriesSchema = FlexibleEnumSchema();
const BlockTypeSchema = FlexibleEnumSchema();
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
    traces: z.array(z.tuple([
        z.tuple([BlockTypeSchema, z.string()]),
        z.array(z.array(TraceTypeSchema)),
    ])),
    results: z
        .array(z.array(z.object({
        value: z.unknown().nullable().optional(),
        error: z.string().nullable().optional(),
    })))
        .nullable()
        .optional(),
});
const TokensClassificationSchema = FlexibleEnumSchema();
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
const BaseActionTypeSchema = FlexibleEnumSchema();
const BaseActionSchema = z.object({
    id: ModelIdSchema,
    type: BaseActionTypeSchema,
});
const BrowseActionOutputSchema = z.object({
    results: z.array(z.object({
        requestedUrl: z.string(),
        browsedUrl: z.string(),
        content: z.string(),
        responseCode: z.string(),
        errorMessage: z.string(),
    })),
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
const SearchLabelsActionOutputSchema = z.object({
    tags: z.array(z.object({
        tag: z.string(),
        match_count: z.number(),
        data_sources: z.array(z.string()),
    })),
});
const SearchLabelsActionTypeSchema = BaseActionSchema.extend({
    agentMessageId: ModelIdSchema,
    output: SearchLabelsActionOutputSchema.nullable(),
    functionCallId: z.string().nullable(),
    functionCallName: z.string().nullable(),
    step: z.number(),
    type: z.literal("search_labels_action"),
});
const ReasoningActionTypeSchema = BaseActionSchema.extend({
    agentMessageId: ModelIdSchema,
    output: z.string().nullable(),
    thinking: z.string().nullable(),
    functionCallId: z.string().nullable(),
    functionCallName: z.string().nullable(),
    step: z.number(),
    type: z.literal("reasoning_action"),
});
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
const DustAppParametersSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));
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
}).transform((o) => (Object.assign(Object.assign({}, o), { output: o.output })));
const DataSourceViewKindSchema = FlexibleEnumSchema();
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
const TIME_FRAME_UNITS = ["hour", "day", "week", "month", "year"];
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
const WhitelistableFeaturesSchema = FlexibleEnumSchema();
const WorkspaceSegmentationSchema = FlexibleEnumSchema().nullable();
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
    ssoEnforced: z.boolean().optional(),
});
const ExtensionWorkspaceSchema = WorkspaceSchema.extend({
    blacklistedDomains: z.array(z.string()).nullable(),
});
const UserProviderSchema = FlexibleEnumSchema().nullable();
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
export const WebsearchResultSchema = z.object({
    title: z.string(),
    snippet: z.string(),
    link: z.string(),
    reference: z.string(),
});
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
const MCPActionTypeSchema = BaseActionSchema.extend({
    agentMessageId: ModelIdSchema,
    functionCallName: z.string().nullable(),
    params: z.unknown(),
    type: z.literal("tool_action"),
});
const GlobalAgentStatusSchema = FlexibleEnumSchema();
const AgentStatusSchema = FlexibleEnumSchema();
const AgentConfigurationStatusSchema = z.union([
    AgentStatusSchema,
    GlobalAgentStatusSchema,
]);
const AgentConfigurationScopeSchema = FlexibleEnumSchema();
export const AgentConfigurationViewSchema = FlexibleEnumSchema();
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
const ContentFragmentContextSchema = z.object({
    username: z.string().optional().nullable(),
    fullName: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    profilePictureUrl: z.string().optional().nullable(),
});
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
const ContentFragmentNodeData = z.object({
    nodeId: z.string(),
    nodeDataSourceViewId: z.string(),
    nodeType: ContentNodeTypeSchema,
    provider: ConnectorProvidersSchema.nullable(),
    spaceName: z.string(),
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
    contentNodeData: ContentFragmentNodeData.nullable(),
});
const AgentMentionSchema = z.object({
    configurationId: z.string(),
});
const UserMessageContextSchema = z.object({
    username: z.string(),
    timezone: Timezone,
    fullName: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    profilePictureUrl: z.string().optional().nullable(),
    origin: UserMessageOriginSchema,
    localMCPServerIds: z.array(z.string()).optional().nullable(),
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
const UserMessageWithRankTypeSchema = UserMessageSchema.and(RankSchema);
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
const AgentMessageStatusSchema = FlexibleEnumSchema();
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
    rawContents: z.array(z.object({
        step: z.number(),
        content: z.string(),
    })),
    error: z
        .object({
        code: z.string(),
        message: z.string(),
    })
        .nullable(),
});
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
const ConversationVisibilitySchema = FlexibleEnumSchema();
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
    content: z.array(z.union([
        z.array(UserMessageSchema),
        z.array(AgentMessageTypeSchema),
        z.array(ContentFragmentSchema),
    ])),
});
const ConversationMessageReactionsSchema = z.array(z.object({
    messageId: z.string(),
    reactions: z.array(z.object({
        emoji: z.string(),
        users: z.array(z.object({
            userId: ModelIdSchema.nullable(),
            username: z.string(),
            fullName: z.string().nullable(),
        })),
    })),
}));
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
const MCPValidationMetadataSchema = z.object({
    mcpServerName: z.string(),
    toolName: z.string(),
    agentName: z.string(),
});
const MCPApproveExecutionEventSchema = z.object({
    type: z.literal("tool_approve_execution"),
    created: z.number(),
    configurationId: z.string(),
    messageId: z.string(),
    action: MCPActionTypeSchema,
    inputs: z.record(z.any()),
    stake: z.optional(z.enum(["low", "high"])),
    metadata: MCPValidationMetadataSchema,
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
const AgentActionSuccessEventSchema = z.object({
    type: z.literal("agent_action_success"),
    created: z.number(),
    configurationId: z.string(),
    messageId: z.string(),
    action: AgentActionTypeSchema,
});
const AgentMessageSuccessEventSchema = z.object({
    type: z.literal("agent_message_success"),
    created: z.number(),
    configurationId: z.string(),
    messageId: z.string(),
    message: AgentMessageTypeSchema,
    runIds: z.array(z.string()),
});
const AgentGenerationCancelledEventSchema = z.object({
    type: z.literal("agent_generation_cancelled"),
    created: z.number(),
    configurationId: z.string(),
    messageId: z.string(),
});
const UserMessageErrorEventSchema = z.object({
    type: z.literal("user_message_error"),
    created: z.number(),
    error: z.object({
        code: z.string(),
        message: z.string(),
    }),
});
// Event sent when the user message is created.
const UserMessageNewEventSchema = z.object({
    type: z.literal("user_message_new"),
    created: z.number(),
    messageId: z.string(),
    message: UserMessageSchema.and(RankSchema),
});
// Event sent when a new message is created (empty) and the agent is about to be executed.
const AgentMessageNewEventSchema = z.object({
    type: z.literal("agent_message_new"),
    created: z.number(),
    configurationId: z.string(),
    messageId: z.string(),
    message: AgentMessageTypeSchema.and(RankSchema),
});
// Event sent when the conversation title is updated.
const ConversationTitleEventSchema = z.object({
    type: z.literal("conversation_title"),
    created: z.number(),
    title: z.string(),
});
const ConversationEventTypeSchema = z.object({
    eventId: z.string(),
    data: z.union([
        UserMessageNewEventSchema,
        AgentMessageNewEventSchema,
        AgentGenerationCancelledEventSchema,
        ConversationTitleEventSchema,
    ]),
});
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
export const CoreAPIErrorSchema = z.object({
    message: z.string(),
    code: z.string(),
});
export const CoreAPITokenTypeSchema = z.tuple([z.number(), z.string()]);
const APIErrorTypeSchema = FlexibleEnumSchema();
export const APIErrorSchema = z.object({
    type: APIErrorTypeSchema,
    message: z.string(),
    data_source_error: CoreAPIErrorSchema.optional(),
    run_error: CoreAPIErrorSchema.optional(),
    app_error: CoreAPIErrorSchema.optional(),
    connectors_error: ConnectorsAPIErrorSchema.optional(),
});
export const WorkspaceDomainSchema = z.object({
    domain: z.string(),
    domainAutoJoinEnabled: z.boolean(),
});
export const DustAppTypeSchema = z.object({
    appHash: z.string(),
    appId: z.string(),
    workspaceId: z.string(),
});
export const DustAppConfigTypeSchema = z.record(z.unknown());
export const DustAppRunErroredEventSchema = z.object({
    type: z.literal("error"),
    content: z.object({
        code: z.string(),
        message: z.string(),
    }),
});
export const DustAppRunRunStatusEventSchema = z.object({
    type: z.literal("run_status"),
    content: z.object({
        status: z.enum(["running", "succeeded", "errored"]),
        run_id: z.string(),
    }),
});
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
export const DustAppRunBlockExecutionEventSchema = z.object({
    type: z.literal("block_execution"),
    content: z.object({
        block_type: BlockTypeSchema,
        block_name: z.string(),
        execution: z.array(z.array(z.object({
            value: z.unknown().nullable(),
            error: z.string().nullable(),
            meta: z.unknown().nullable(),
        }))),
    }),
});
export const DustAppRunFinalEventSchema = z.object({
    type: z.literal("final"),
});
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
const SpaceKindSchema = FlexibleEnumSchema();
const SpaceTypeSchema = z.object({
    createdAt: z.number(),
    groupIds: z.array(z.string()),
    isRestricted: z.boolean(),
    kind: SpaceKindSchema,
    name: z.string(),
    sId: z.string(),
    updatedAt: z.number(),
});
const DatasetSchemaEntryType = FlexibleEnumSchema();
const DatasetSchema = z.object({
    name: z.string(),
    description: z.string().nullable(),
    data: z.array(z.record(z.any())).nullable().optional(),
    schema: z
        .array(z.object({
        key: z.string(),
        type: DatasetSchemaEntryType,
        description: z.string().nullable(),
    }))
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
export const RunAppResponseSchema = z.object({
    run: RunTypeSchema,
});
export const GetDataSourcesResponseSchema = z.object({
    data_sources: DataSourceTypeSchema.array(),
});
export const GetOrPatchAgentConfigurationResponseSchema = z.object({
    agentConfiguration: LightAgentConfigurationSchema,
});
export const PatchAgentConfigurationRequestSchema = z.object({
    userFavorite: z.boolean().optional(),
});
export const GetAgentConfigurationsResponseSchema = z.object({
    agentConfigurations: LightAgentConfigurationSchema.array(),
});
export const PostContentFragmentResponseSchema = z.object({
    contentFragment: ContentFragmentSchema,
});
export const CreateConversationResponseSchema = z.object({
    conversation: ConversationSchema,
    message: UserMessageSchema,
});
export const GetFeedbacksResponseSchema = z.object({
    feedbacks: z.array(AgentMesssageFeedbackSchema),
});
export const PublicPostMessageFeedbackRequestBodySchema = z.object({
    thumbDirection: z.string(),
    feedbackContent: z.string().nullable().optional(),
    isConversationShared: z.boolean().optional(),
});
export const PostMessageFeedbackResponseSchema = z.object({
    success: z.literal(true),
});
export const PostUserMessageResponseSchema = z.object({
    message: UserMessageSchema,
});
export const GetConversationResponseSchema = z.object({
    conversation: ConversationSchema,
});
export const TokenizeResponseSchema = z.object({
    tokens: CoreAPITokenTypeSchema.array(),
});
export const GetActiveMemberEmailsInWorkspaceResponseSchema = z.object({
    emails: z.array(z.string()),
});
export const GetWorkspaceVerifiedDomainsResponseSchema = z.object({
    verified_domains: WorkspaceDomainSchema.array(),
});
export const GetWorkspaceFeatureFlagsResponseSchema = z.object({
    feature_flags: WhitelistableFeaturesSchema.array(),
});
export const PublicPostMessagesRequestBodySchema = z.intersection(z.object({
    content: z.string().min(1),
    mentions: z.array(z.object({
        configurationId: z.string(),
    })),
    context: UserMessageContextSchema.extend({
        localMCPServerIds: z.array(z.string()).optional().nullable(),
    }),
}), z
    .object({
    blocking: z.boolean().optional(),
})
    .partial());
export const PublicPostEditMessagesRequestBodySchema = z.object({
    content: z.string(),
    mentions: z.array(z.object({
        configurationId: z.string(),
    })),
});
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
export const PublicPostConversationsRequestBodySchema = z.intersection(z.object({
    title: z.string().nullable().optional(),
    visibility: z
        .enum(["unlisted", "workspace", "deleted", "test"])
        .optional()
        .default("unlisted"),
    message: z.union([
        z.intersection(z.object({
            content: z.string().min(1),
            mentions: z.array(z.object({
                configurationId: z.string(),
            })),
            context: UserMessageContextSchema,
        }), z
            .object({
            blocking: z.boolean().optional(),
        })
            .partial()),
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
}), z
    .object({
    blocking: z.boolean().optional(),
})
    .partial());
export const PostConversationsResponseSchema = z.object({
    conversation: ConversationSchema,
    message: UserMessageSchema.optional(),
    contentFragment: ContentFragmentSchema.optional(),
});
export const GetConversationsResponseSchema = z.object({
    conversations: ConversationWithoutContentSchema.array(),
});
export const SearchDataSourceViewsRequestSchema = z.object({
    dataSourceId: z.string().optional(),
    kind: z.string().optional(),
    vaultId: z.string().optional(),
    vaultKind: z.string().optional(),
});
export const SearchDataSourceViewsResponseSchema = z.object({
    data_source_views: DataSourceViewSchema.array(),
});
const ListMemberEmailsResponseSchema = z.object({
    emails: z.array(z.string()),
});
export const ValidateMemberRequestSchema = z.object({
    email: z.string(),
});
const ValidateMemberResponseSchema = z.object({
    valid: z.boolean(),
});
export const GetAppsResponseSchema = z.object({
    apps: AppTypeSchema.array(),
});
export const PostAppsRequestSchema = z.object({
    apps: AppTypeSchema.array(),
});
export const ImportAppsResponseSchema = z.object({
    apps: z
        .object({
        sId: z.string(),
        name: z.string(),
        error: z.string().optional(),
    })
        .array(),
});
export const DataSourceViewResponseSchema = z.object({
    dataSourceView: DataSourceViewSchema,
});
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
const DataSourceSearchResponseSchema = z.object({
    documents: CoreAPIDocumentSchema.array(),
});
const DataSourceViewsListResponseSchema = z.object({
    dataSourceViews: DataSourceViewSchema.array(),
});
const FrontDataSourceDocumentSectionSchema = z.lazy(() => z.object({
    prefix: z.string().nullable(),
    content: z.string().nullable(),
    sections: z.array(FrontDataSourceDocumentSectionSchema),
}));
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
const GetDocumentResponseSchema = z.object({
    document: CoreAPIDocumentSchema,
});
const DeleteDocumentResponseSchema = z.object({
    document: z.object({
        document_id: z.string(),
    }),
});
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
const PostParentsResponseSchema = z.object({
    updated: z.boolean(),
});
const GetDocumentsResponseSchema = z.object({
    documents: z.array(CoreAPIDocumentSchema),
    total: z.number(),
});
const GetTableRowsResponseSchema = z.object({
    row: CoreAPIRowSchema,
});
export const UpsertTableRowsRequestSchema = z.object({
    rows: z.array(z.object({
        row_id: z.string(),
        value: z.record(z
            .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.object({
                type: z.literal("datetime"),
                epoch: z.number(),
            }),
        ])
            .nullable()),
    })),
    truncate: z.boolean().optional(),
});
const UpsertTableRowsResponseSchema = z.object({
    table: z.object({
        name: z.string(),
        table_id: z.string(),
        description: z.string(),
        schema: CoreAPITableSchema.nullable(),
    }),
});
const ListTableRowsResponseSchema = z.object({
    rows: z.array(CoreAPIRowSchema),
    offset: z.number(),
    limit: z.number(),
    total: z.number(),
});
const GetTableResponseSchema = z.object({
    table: CoreAPITablePublicSchema,
});
export const PostTableParentsRequestSchema = z.object({
    parent_id: z.string().nullable().optional(),
    parents: z.array(z.string()),
});
const PostTableParentsResponseSchema = z.object({
    updated: z.literal(true),
});
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
const PostTableCSVAsyncResponseSchema = z.object({
    table: z.object({
        table_id: z.string(),
    }),
});
const PostTableCSVResponseSchema = z.object({
    table: CoreAPITableSchema,
});
const ListTablesResponseSchema = z.object({
    tables: z.array(CoreAPITablePublicSchema),
});
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
const UpsertTableResponseSchema = z.object({
    table: CoreAPITablePublicSchema,
});
const SupportedUsageTablesSchema = FlexibleEnumSchema();
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
export const GetFolderResponseSchema = z.object({
    folder: CoreAPIFolderSchema,
});
export const DeleteFolderResponseSchema = z.object({
    folder: z.object({
        folder_id: z.string(),
    }),
});
export const UpsertFolderResponseSchema = z.object({
    folder: CoreAPIFolderSchema,
    data_source: DataSourceTypeSchema,
});
const ProviderVisibilitySchema = FlexibleEnumSchema();
export const UpsertDataSourceFolderRequestSchema = z.object({
    timestamp: z.number(),
    parents: z.array(z.string()).nullable().optional(),
    parent_id: z.string().nullable().optional(),
    title: z.string(),
    mime_type: z.string(),
    source_url: z.string().nullable().optional(),
    provider_visibility: ProviderVisibilitySchema.nullable().optional(),
});
const DateSchema = z
    .string()
    .refine((s) => /^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/.test(s), "YYYY-MM or YYYY-MM-DD");
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
const FileTypeStatusSchema = FlexibleEnumSchema();
const FileTypeUseCaseSchema = FlexibleEnumSchema();
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
export const FileTypeWithUploadUrlSchema = FileTypeSchema.extend({
    uploadUrl: z.string(),
});
export const FileUploadRequestResponseSchema = z.object({
    file: FileTypeWithUploadUrlSchema,
});
export const FileUploadedRequestResponseSchema = z.object({
    file: FileTypeSchema,
});
export const MeResponseSchema = z.object({
    user: UserSchema.and(z.object({
        workspaces: WorkspaceSchema.array().or(ExtensionWorkspaceSchema.array()),
    })),
});
export const CancelMessageGenerationResponseSchema = z.object({
    success: z.literal(true),
});
export const CancelMessageGenerationRequestSchema = z.object({
    messageIds: z.array(z.string()),
});
// Typeguards.
export function isRetrievalActionType(action) {
    return action.type === "retrieval_action";
}
export function isWebsearchActionType(action) {
    return action.type === "websearch_action";
}
export function isTablesQueryActionType(action) {
    return action.type === "tables_query_action";
}
export function isDustAppRunActionType(action) {
    return action.type === "dust_app_run_action";
}
export function isProcessActionType(action) {
    return action.type === "process_action";
}
export function BrowseActionPublicType(action) {
    return action.type === "browse_action";
}
export function isReasoningActionType(action) {
    return action.type === "reasoning_action";
}
export function isSearchLabelsActionType(action) {
    return action.type === "search_labels_action";
}
export function isAgentMention(arg) {
    return arg.configurationId !== undefined;
}
export function assertNever(x) {
    throw new Error(`${typeof x === "object" ? JSON.stringify(x) : x} is not of type never. This should never happen.`);
}
export function removeNulls(arr) {
    return arr.filter((v) => v !== null && v !== undefined);
}
export function getProviderFromRetrievedDocument(document) {
    if (document.dataSourceView) {
        if (document.dataSourceView.dataSource.connectorProvider === "webcrawler") {
            return "document";
        }
        return document.dataSourceView.dataSource.connectorProvider || "document";
    }
    return "document";
}
export function getTitleFromRetrievedDocument(document) {
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
    apps: z.array(z.object({
        appId: z.string(),
        appHash: z.string(),
    })),
});
export const AppsCheckResponseSchema = z.object({
    apps: z.array(z.object({
        appId: z.string(),
        appHash: z.string(),
        deployed: z.boolean(),
    })),
});
export const GetSpacesResponseSchema = z.object({
    spaces: z.array(SpaceTypeSchema),
});
export const BaseSearchBodySchema = z.object({
    viewType: ContentNodesViewTypeSchema,
    spaceIds: z.array(z.string()),
    includeDataSources: z.boolean(),
    limit: z.number(),
});
const TextSearchBodySchema = z.intersection(BaseSearchBodySchema, z.object({
    query: z.string(),
    nodeIds: z.undefined().optional(),
}));
const NodeIdSearchBodySchema = z.intersection(BaseSearchBodySchema, z.object({
    nodeIds: z.array(z.string()),
    query: z.undefined().optional(),
}));
export const SearchRequestBodySchema = z.union([
    TextSearchBodySchema,
    NodeIdSearchBodySchema,
]);
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
export const ContentNodeWithParentSchema = z.intersection(ContentNodeSchema, z.object({
    parentsInternalIds: z.array(z.string()).optional(),
    parentTitle: z.string().optional().nullable(),
}));
export const DataSourceContentNodeSchema = z.intersection(ContentNodeWithParentSchema, z.object({
    dataSource: DataSourceTypeSchema,
    dataSourceViews: DataSourceViewSchema.array(),
}));
export const DataSourceViewContentNodeSchema = z.intersection(ContentNodeWithParentSchema, z.object({
    dataSourceView: DataSourceViewSchema,
}));
export const SearchWarningCodeSchema = z.literal("truncated-query-clauses");
export const PostWorkspaceSearchResponseBodySchema = z.object({
    nodes: DataSourceContentNodeSchema.array(),
    warningCode: SearchWarningCodeSchema.optional().nullable(),
});
// TODO(mcp) move somewhere else as we'll need dynamic labels for MCP.
export const ACTION_RUNNING_LABELS = {
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
// MCP Related.
export const ValidateActionResponseSchema = z.object({
    success: z.boolean(),
});
export const ValidateActionRequestBodySchema = z.object({
    actionId: z.number(),
    approved: z.enum(["approved", "rejected", "always_approved"]),
});
export const RegisterMCPResponseSchema = z.object({
    success: z.boolean(),
    expiresAt: z.string(),
});
export const HeartbeatMCPResponseSchema = z.object({
    success: z.boolean(),
    expiresAt: z.string(),
});
export const PublicPostMCPResultsRequestBodySchema = z.object({
    requestId: z.string(),
    result: z.unknown(),
});
export const PostMCPResultsResponseSchema = z.object({
    success: z.boolean(),
});
const MCP_TOOL_STAKE_LEVELS = ["high", "low"];
const MCP_VALIDATION_OUTPUTS = [
    "approved",
    "rejected",
    "always_approved",
];
//# sourceMappingURL=types.js.map