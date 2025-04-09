import { getTablesQueryResultsFileTitle } from "@app/components/actions/tables_query/utils";
import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/actions/constants";
import type { DustAppParameters } from "@app/lib/actions/dust_app_run";
import { runActionStreamed } from "@app/lib/actions/server";
import type {
  ActionGeneratedFileType,
  ExtractActionBlob,
} from "@app/lib/actions/types";
import type { BaseActionRunParams } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { dustAppRunInputsToInputSchema } from "@app/lib/actions/types/agent";
import { renderConversationForModel } from "@app/lib/api/assistant/generation";
import type { CSVRecord } from "@app/lib/api/csv";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  ConnectorProvider,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@app/types";
import { assertNever, Ok, removeNulls } from "@app/types";

// Need a model with at least 32k to run tables query.
const TABLES_QUERY_MIN_TOKEN = 28_000;
const RENDERED_CONVERSATION_MIN_TOKEN = 4_000;
const TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH = 500;

export type TablesQueryConfigurationType = {
  description: string | null;
  id: ModelId;
  name: string;
  sId: string;
  tables: TableDataSourceConfiguration[];
  type: "tables_query_configuration";
};

export type TableDataSourceConfiguration = {
  workspaceId: string;
  dataSourceViewId: string;
  tableId: string;
};

function getTablesQueryResultsFileAttachments({
  resultsFileId,
  resultsFileSnippet,
  sectionFileId,
  output,
}: {
  resultsFileId: string | null;
  resultsFileSnippet: string | null;
  sectionFileId: string | null;
  output: Record<string, unknown> | null;
}): string | null {
  if (!resultsFileId || !resultsFileSnippet) {
    return null;
  }

  const fileTitle = getTablesQueryResultsFileTitle({ output });

  const resultsFileAttachment =
    `<file ` +
    `id="${resultsFileId}" type="text/csv" title="${fileTitle}">\n${resultsFileSnippet}\n</file>`;

  let sectionFileAttachment = "";
  if (sectionFileId) {
    sectionFileAttachment =
      `\n<file ` +
      `id="${sectionFileId}" type="application/vnd.dust.section.json" title="${fileTitle} (Results optimized for search)" />`;
  }

  return `${resultsFileAttachment}${sectionFileAttachment}`;
}

/**
 * TablesQuey Events
 */

type TablesQueryErrorEvent = {
  type: "tables_query_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code:
      | "tables_query_error"
      | "too_many_result_rows"
      | "require_authentication";
    message: string;
  };
};

type TablesQueryStartedEvent = {
  type: "tables_query_started";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

type TablesQueryModelOutputEvent = {
  type: "tables_query_model_output";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

type TablesQueryOutputEvent = {
  type: "tables_query_output";
  created: number;
  configurationId: string;
  messageId: string;
  action: TablesQueryActionType;
};

export type TablesQueryActionRunningEvents =
  | TablesQueryStartedEvent
  | TablesQueryModelOutputEvent
  | TablesQueryOutputEvent;

type TablesQueryActionBlob = ExtractActionBlob<TablesQueryActionType>;

export class TablesQueryActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: DustAppParameters;
  readonly output: Record<string, string | number | boolean> | null;
  readonly resultsFileId: string | null;
  readonly resultsFileSnippet: string | null;
  readonly sectionFileId: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "tables_query_action";

  constructor(blob: TablesQueryActionBlob) {
    super(blob.id, blob.type, blob.generatedFiles);

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
    this.resultsFileId = blob.resultsFileId;
    this.resultsFileSnippet = blob.resultsFileSnippet;
    this.sectionFileId = blob.sectionFileId;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_TABLES_QUERY_ACTION_NAME,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    const partialOutput: Omit<FunctionMessageTypeModel, "content"> = {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_TABLES_QUERY_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
    };

    // Unexpected error case -- we don't have any action output.
    if (!this.output) {
      return {
        ...partialOutput,
        content: "(query failed)",
      };
    }

    let content = "";

    // Add reasoning if it exists (should always exist).
    if (typeof this.output.thinking === "string") {
      content += `Reasoning:\n${this.output.thinking}\n\n`;
    }

    const query =
      typeof this.output.query === "string" ? this.output.query : null;

    if (!query) {
      // Model didn't generate a query, so we don't have any results.
      content += "No query was executed.\n";
      return {
        ...partialOutput,
        content,
      };
    }

    content += `Query:\n${this.output.query}\n\n`;

    const error =
      typeof this.output.error === "string" ? this.output.error : null;

    if (error) {
      // Generated query failed to execute.
      content += `Error:\n${this.output.error}\n\n`;
      return {
        ...partialOutput,
        content,
      };
    }

    const hasResultsFile = this.resultsFileId && this.resultsFileSnippet;

    if (!hasResultsFile && !this.output.results) {
      // We don't have any results -- this is unexpected, we should always
      // have either an eror or some results (either a file or a `results` prop).
      content += "No results were returned.\n";
      return {
        ...partialOutput,
        content,
      };
    }

    if (hasResultsFile) {
      const attachments = getTablesQueryResultsFileAttachments({
        resultsFileId: this.resultsFileId,
        resultsFileSnippet: this.resultsFileSnippet,
        sectionFileId: this.sectionFileId,
        output: this.output,
      });
      if (!attachments) {
        throw new Error(
          "Unexpected: No file attachment for tables query with results file."
        );
      }
      // New path -- we have a results file.
      // We render it as an attachment.
      return {
        ...partialOutput,
        content: attachments,
      };
    }

    // Legacy path -- we don't have a results file.
    // We render the raw results object inline.
    content += `OUTPUT:\n${JSON.stringify(this.output, null, 2)}`;

    return {
      ...partialOutput,
      content,
    };
  }
}

const getTablesQueryError = (error: string) => {
  switch (error) {
    case "require_authentication":
      return {
        code: "require_authentication" as const,
        message: `The query requires authentication. Please connect to the data source.`,
      };
    case "too_many_result_rows":
      return {
        code: "too_many_result_rows" as const,
        message: `The query returned too many rows. Please refine your query.`,
      };
    default:
      return {
        code: "tables_query_error" as const,
        message: `Error running TablesQuery app: ${error}`,
      };
  }
};

// Internal interface for the retrieval and rendering of a TableQuery action. This should not be
// used outside of api/assistant. We allow a ModelId interface here because we don't have `sId` on
// actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of this action).
export async function tableQueryTypesFromAgentMessageIds(
  auth: Authenticator,
  agentMessageIds: ModelId[]
): Promise<TablesQueryActionType[]> {
  const owner = auth.getNonNullableWorkspace();

  const actions = await AgentTablesQueryAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
    include: [
      {
        model: FileModel,
        as: "resultsFile",
      },
      {
        model: FileModel,
        as: "sectionFile",
      },
    ],
  });

  return actions.map((action) => {
    const title = getTablesQueryResultsFileTitle({
      output: action.output as CSVRecord,
    });

    const resultsFile: ActionGeneratedFileType | null = action.resultsFile
      ? {
          fileId: FileResource.modelIdToSId({
            id: action.resultsFile.id,
            workspaceId: owner.id,
          }),
          title,
          contentType: action.resultsFile.contentType,
          snippet: action.resultsFile.snippet,
        }
      : null;

    const sectionFile: ActionGeneratedFileType | null = action.sectionFile
      ? {
          fileId: FileResource.modelIdToSId({
            id: action.sectionFile.id,
            workspaceId: owner.id,
          }),
          title: `${title} (Section representation)`,
          contentType: action.sectionFile.contentType,
          snippet: action.sectionFile.snippet,
        }
      : null;

    return new TablesQueryActionType({
      id: action.id,
      params: action.params as DustAppParameters,
      output: action.output as Record<string, string | number | boolean>,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
      resultsFileId: resultsFile ? resultsFile.fileId : null,
      resultsFileSnippet: action.resultsFileSnippet,
      sectionFileId: sectionFile ? sectionFile.fileId : null,
      generatedFiles: removeNulls([resultsFile, sectionFile]),
      type: "tables_query_action",
    });
  });
}

/**
 * Params generation.
 */

// Generate the specification for the TablesQuery app. This is the instruction given to the LLM to
// understand the task.
async function tablesQueryActionSpecification({
  name,
  description,
}: {
  name: string;
  description: string;
}): Promise<AgentActionSpecification> {
  return {
    name,
    description,
    inputSchema: dustAppRunInputsToInputSchema([]),
  };
}

/**
 * Action execution.
 */
export class TablesQueryConfigurationServerRunner extends BaseActionConfigurationServerRunner<TablesQueryConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runQueryTables`");
    }

    let actionDescription =
      "Query data tables described below by executing a SQL query automatically generated from the conversation context. " +
      "The function does not require any inputs, the SQL query will be inferred from the conversation history.";
    if (description) {
      actionDescription += `\nDescription of the data tables:\n${description}`;
    }

    const spec = await tablesQueryActionSpecification({
      name,
      description: actionDescription,
    });
    return new Ok(spec);
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    | TablesQueryErrorEvent
    | TablesQueryStartedEvent
    | TablesQueryModelOutputEvent
    | TablesQueryOutputEvent
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runQueryTables`");
    }

    const { actionConfiguration } = this;

    let output: Record<string, string | boolean | number> = {};

    // Creating action
    const action = await AgentTablesQueryAction.create({
      tablesQueryConfigurationId: actionConfiguration.sId,
      params: rawInputs,
      output,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step: step,
      workspaceId: owner.id,
    });

    yield {
      type: "tables_query_started",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new TablesQueryActionType({
        id: action.id,
        params: action.params as DustAppParameters,
        output: action.output as Record<string, string | number | boolean>,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        agentMessageId: action.agentMessageId,
        step: action.step,
        resultsFileId: null,
        resultsFileSnippet: null,
        sectionFileId: null,
        generatedFiles: [],
        type: "tables_query_action",
      }),
    };

    // Render conversation for the action.
    const supportedModel = getSupportedModelConfig(agentConfiguration.model);
    if (!supportedModel) {
      throw new Error("Unreachable: Supported model not found.");
    }

    const allowedTokenCount =
      supportedModel.contextSize - TABLES_QUERY_MIN_TOKEN;
    if (allowedTokenCount < RENDERED_CONVERSATION_MIN_TOKEN) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message:
            "The model's context size is too small to be used with TablesQuery.",
        },
      };
      return;
    }

    const renderedConversationRes = await renderConversationForModel(auth, {
      conversation,
      model: supportedModel,
      prompt: agentConfiguration.instructions ?? "",
      allowedTokenCount,
      excludeImages: true,
    });
    if (renderedConversationRes.isErr()) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message: `Error running TablesQuery app: ${renderedConversationRes.error.message}`,
        },
      };
      return;
    }

    const renderedConversation = renderedConversationRes.value;

    // Generating configuration
    const config = cloneBaseConfig(
      getDustProdAction("assistant-v2-query-tables").config
    );

    const dataSourceViews = await DataSourceViewResource.fetchByIds(auth, [
      ...new Set(actionConfiguration.tables.map((t) => t.dataSourceViewId)),
    ]);
    const connectionIds: Record<string, string> = {};
    for (const dataSourceView of dataSourceViews) {
      const connection =
        await dataSourceView.dataSource.getPersonalConnection(auth);
      if (connection) {
        connectionIds[dataSourceView.sId] = connection;
      }
    }

    const tables = actionConfiguration.tables.map((t) => ({
      workspace_id: t.workspaceId,
      table_id: t.tableId,
      // Note: This value is passed to the registry for lookup. The registry will return the
      // associated data source's dustAPIDataSourceId.
      data_source_id: t.dataSourceViewId,
      remote_database_secret_id: connectionIds[t.dataSourceViewId],
    }));
    if (tables.length === 0) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message:
            "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
        },
      };
      return;
    }
    config.DATABASE_SCHEMA = {
      type: "database_schema",
      tables,
    };
    config.DATABASE = {
      type: "database",
      tables,
    };
    config.DATABASE_TABLE_HEAD = {
      type: "database",
      tables,
    };
    const { model } = agentConfiguration;
    config.MODEL.provider_id = model.providerId;
    config.MODEL.model_id = model.modelId;

    // Running the app
    const res = await runActionStreamed(
      auth,
      "assistant-v2-query-tables",
      config,
      [
        {
          conversation: renderedConversation.modelConversation.messages,
          instructions: agentConfiguration.instructions,
        },
      ],
      {
        conversationId: conversation.sId,
        workspaceId: conversation.owner.sId,
        agentMessageId: agentMessage.sId,
      }
    );

    if (res.isErr()) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message: `Error running TablesQuery app: ${res.error.message}`,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = res.value;
    for await (const event of eventStream) {
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running query_tables app"
        );
        yield {
          type: "tables_query_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "tables_query_error",
            message: `Error running TablesQuery app: ${event.content.message}`,
          },
        };
        return;
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];

        if (e.error) {
          logger.error(
            {
              workspaceId: owner.id,
              conversationId: conversation.id,
              error: e.error,
            },
            "Error running query_tables app"
          );

          yield {
            type: "tables_query_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: getTablesQueryError(e.error),
          };
          return;
        }

        if (event.content.block_name === "MODEL_OUTPUT") {
          // Check e.value is an object.

          if (e.value && typeof e.value === "object") {
            yield {
              type: "tables_query_model_output",
              created: Date.now(),
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              action: new TablesQueryActionType({
                id: action.id,
                params: action.params as DustAppParameters,
                output: e.value as Record<string, string | number | boolean>,
                functionCallId: action.functionCallId,
                functionCallName: action.functionCallName,
                agentMessageId: agentMessage.id,
                step: action.step,
                resultsFileId: null,
                resultsFileSnippet: null,
                sectionFileId: null,
                generatedFiles: [],
                type: "tables_query_action",
              }),
            };
          }
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
          output = JSON.parse(e.value as string);
        }
      }
    }

    const sanitizedOutput = sanitizeJSONOutput(output) as Record<
      string,
      unknown
    >;

    const updateParams: {
      resultsFileId: number | null;
      resultsFileSnippet: string | null;
      sectionFileId: number | null;
      output: Record<string, unknown> | null;
    } = {
      resultsFileId: null,
      resultsFileSnippet: null,
      sectionFileId: null,
      output: null,
    };

    let generatedResultFile: ActionGeneratedFileType | null = null;
    let generatedsectionFile: ActionGeneratedFileType | null = null;

    const rawResults =
      "results" in sanitizedOutput ? sanitizedOutput.results : [];
    let results: CSVRecord[] = [];

    if (Array.isArray(rawResults)) {
      results = rawResults.filter(
        (record) =>
          record !== undefined && record !== null && typeof record === "object"
      );
    }

    if (results.length > 0) {
      const queryTitle = getTablesQueryResultsFileTitle({
        output: sanitizedOutput,
      });

      // Generate the CSV file.
      const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(auth, {
        title: queryTitle,
        conversationId: conversation.sId,
        results,
      });

      // Upload the CSV file to the conversation data source.
      await uploadFileToConversationDataSource({
        auth,
        file: csvFile,
      });

      //  Save ref to the generated csv file to be yielded later.
      generatedResultFile = {
        fileId: csvFile.sId,
        title: queryTitle,
        contentType: csvFile.contentType,
        snippet: csvFile.snippet,
      };

      // Check if we should generate a section JSON file.
      const shouldGeneratesectionFile = results.some((result) => {
        for (const value of Object.values(result)) {
          if (
            typeof value === "string" &&
            value.length > TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH
          ) {
            return true;
          }
        }
        return false;
      });

      let sectionFile: FileResource | null = null;
      if (shouldGeneratesectionFile) {
        // First we fetch the connector provider for the data source, cause the chunking
        // strategy of the section file depends on it: Since all tables are from the same
        // data source, we can just take the first table's data source view id.
        const dataSourceView = await DataSourceViewResource.fetchById(
          auth,
          actionConfiguration.tables[0].dataSourceViewId
        );
        const connectorProvider =
          dataSourceView?.dataSource?.connectorProvider ?? null;
        const sectionColumnsPrefix = getSectionColumnsPrefix(connectorProvider);

        // Generate the section file.
        sectionFile = await generateSectionFile(auth, {
          title: queryTitle,
          conversationId: conversation.sId,
          results,
          sectionColumnsPrefix,
        });

        // Upload the section file to the conversation data source.
        await uploadFileToConversationDataSource({
          auth,
          file: sectionFile,
        });

        // Save ref to the generated section file to be yielded later.
        generatedsectionFile = {
          fileId: sectionFile.sId,
          title: `${queryTitle} (Rich Text)`,
          contentType: sectionFile.contentType,
          snippet: null,
        };
      }

      delete sanitizedOutput.results;
      updateParams.resultsFileId = csvFile.id;
      updateParams.resultsFileSnippet = csvSnippet;
      updateParams.sectionFileId = sectionFile?.id ?? null;
    }

    // Updating action
    await action.update({
      ...updateParams,
      output: sanitizedOutput,
      runId: await dustRunId,
    });

    yield {
      type: "tables_query_output",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new TablesQueryActionType({
        id: action.id,
        params: action.params as DustAppParameters,
        output: sanitizedOutput as Record<string, string | number | boolean>,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        agentMessageId: action.agentMessageId,
        step: action.step,
        resultsFileId: generatedResultFile?.fileId ?? null,
        resultsFileSnippet: updateParams.resultsFileSnippet,
        sectionFileId: generatedsectionFile?.fileId ?? null,
        generatedFiles: removeNulls([
          generatedResultFile,
          generatedsectionFile,
        ]),
        type: "tables_query_action",
      }),
    };
    return;
  }
}

/**
 * Get the prefix for a row in a section file.
 * This prefix is used to identify the row in the section file.
 * We currently only support Salesforce since it's the only connector for which we can
 * generate a prefix.
 */
function getSectionColumnsPrefix(
  provider: ConnectorProvider | null
): string[] | null {
  switch (provider) {
    case "salesforce":
      return ["Id", "Name"];
    case "confluence":
    case "github":
    case "google_drive":
    case "intercom":
    case "notion":
    case "slack":
    case "microsoft":
    case "webcrawler":
    case "snowflake":
    case "zendesk":
    case "bigquery":
    case "gong":
    case null:
      return null;
    default:
      assertNever(provider);
  }
}
