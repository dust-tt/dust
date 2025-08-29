import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import {
  QUERY_TABLES_TOOL_NAME,
  TABLE_QUERY_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ExecuteTablesQueryErrorResourceType,
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { fetchTableDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import {
  makeInternalMCPServer,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { runActionStreamed } from "@app/lib/actions/server";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import type { CSVRecord } from "@app/lib/api/csv";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { ConnectorProvider } from "@app/types";
import { assertNever } from "@app/types";

// Types for the resources that are output by the tools of this server.
type TablesQueryOutputResources =
  | ThinkingOutputType
  | SqlQueryOutputType
  | ExecuteTablesQueryErrorResourceType
  | ToolGeneratedFileType;

// We need a model with at least 54k tokens to run tables_query.
const TABLES_QUERY_MIN_TOKEN = 50_000;
const RENDERED_CONVERSATION_MIN_TOKEN = 4_000;
export const TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH = 500;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(TABLE_QUERY_SERVER_NAME);

  server.tool(
    QUERY_TABLES_TOOL_NAME,
    "Query data tables described below by executing a SQL query automatically generated from the conversation context. " +
      "The function does not require any inputs, the SQL query will be inferred from the conversation history.",
    {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
    },
    async ({ tables }) => {
      if (!agentLoopContext?.runContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      const agentLoopRunContext = agentLoopContext.runContext;

      const owner = auth.getNonNullableWorkspace();

      // Render conversation for the action.
      const supportedModel = getSupportedModelConfig(
        agentLoopRunContext.agentConfiguration.model
      );
      if (!supportedModel) {
        throw new Error("Unreachable: Supported model not found.");
      }

      const allowedTokenCount =
        supportedModel.contextSize - TABLES_QUERY_MIN_TOKEN;
      if (allowedTokenCount < RENDERED_CONVERSATION_MIN_TOKEN) {
        return makeMCPToolTextError(
          "The model's context size is too small to be used with TablesQuery."
        );
      }

      const renderedConversationRes = await renderConversationForModel(auth, {
        conversation: agentLoopRunContext.conversation,
        model: supportedModel,
        prompt: agentLoopRunContext.agentConfiguration.instructions ?? "",
        tools: "",
        allowedTokenCount,
        excludeImages: true,
        onMissingAction: "skip",
      });
      if (renderedConversationRes.isErr()) {
        return makeMCPToolTextError(
          `Error rendering conversation for model: ${renderedConversationRes.error.message}`
        );
      }

      const renderedConversation = renderedConversationRes.value;

      // Generating configuration
      const config = cloneBaseConfig(
        getDustProdAction("assistant-v2-query-tables").config
      );

      const tableConfigurationsRes = await fetchTableDataSourceConfigurations(
        auth,
        tables
      );
      if (tableConfigurationsRes.isErr()) {
        return makeMCPToolTextError(
          `Error fetching table configurations: ${tableConfigurationsRes.error.message}`
        );
      }

      const tableConfigurations = tableConfigurationsRes.value;

      const configuredTables = tableConfigurations.map((t) => {
        return {
          workspace_id: t.workspaceId,
          table_id: t.tableId,
          // Note: This value is passed to the registry for lookup.
          // The registry will return the associated data source's dustAPIDataSourceId.
          data_source_id: t.dataSourceViewId,
          remote_database_secret_id: null,
        };
      });
      if (configuredTables.length === 0) {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
            },
          ],
        };
      }
      config.DATABASE_SCHEMA = {
        type: "database_schema",
        tables: configuredTables,
      };
      config.DATABASE = {
        type: "database",
        tables: configuredTables,
      };
      config.DATABASE_TABLE_HEAD = {
        type: "database",
        tables: configuredTables,
      };
      const { model } = agentLoopRunContext.agentConfiguration;
      config.MODEL.provider_id = model.providerId;
      config.MODEL.model_id = model.modelId;

      const conversation = renderedConversation.modelConversation.messages;

      // We remove the last tool call from the conversation, as this tool call is simply triggering the
      // tables query dust app.
      const lastMessage = conversation[conversation.length - 1];
      if (lastMessage.role === "assistant") {
        // Only keep the message if it has some chain of thought.
        if (lastMessage.content?.length) {
          if ("function_calls" in lastMessage) {
            lastMessage.function_calls = [];
          }
          lastMessage.contents = lastMessage.contents?.filter(
            (c) => c.type !== "function_call"
          );
          conversation[conversation.length - 1] = lastMessage;
        } else {
          // Otherwise we simply remove the message.
          conversation.pop();
        }
      }

      // Running the app
      const res = await runActionStreamed(
        auth,
        "assistant-v2-query-tables",
        config,
        [
          {
            conversation,
            instructions: agentLoopRunContext.agentConfiguration.instructions,
          },
        ],
        {
          conversationId: agentLoopRunContext.conversation.sId,
          workspaceId: agentLoopRunContext.conversation.owner.sId,
          agentMessageId: agentLoopRunContext.agentMessage.sId,
        }
      );
      if (res.isErr()) {
        return makeMCPToolTextError(
          `Error running TablesQuery app: ${res.error.message}`
        );
      }

      let output: Record<string, string | boolean | number> = {};

      const { eventStream } = res.value;
      for await (const event of eventStream) {
        if (event.type === "error") {
          logger.error(
            {
              workspaceId: owner.sId,
              conversationId: agentLoopRunContext.conversation.sId,
              error: event.content.message,
            },
            "Error running query_tables app"
          );
          return makeMCPToolTextError(
            `Error running TablesQuery app: ${event.content.message}`
          );
        }

        if (event.type === "block_execution") {
          const e = event.content.execution[0][0];

          if (e.error) {
            logger.error(
              {
                workspaceId: owner.sId,
                conversationId: agentLoopRunContext.conversation.sId,
                error: e.error,
              },
              "Error running query_tables app"
            );
            return makeMCPToolTextError(getTablesQueryError(e.error).message);
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

      const content: {
        type: "resource";
        resource: TablesQueryOutputResources;
      }[] = [];

      if (typeof output?.thinking === "string") {
        content.push({
          type: "resource",
          resource: {
            text: output.thinking,
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.THINKING,
            uri: "",
          },
        });
      }

      if (typeof output?.query === "string") {
        content.push({
          type: "resource",
          resource: {
            text: output.query,
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.SQL_QUERY,
            uri: "",
          },
        });
      }

      const rawResults =
        "results" in sanitizedOutput ? sanitizedOutput.results : [];

      const results: CSVRecord[] = Array.isArray(rawResults)
        ? rawResults.filter(
            (record) =>
              record !== undefined &&
              record !== null &&
              typeof record === "object"
          )
        : [];

      if (sanitizedOutput.error && typeof sanitizedOutput.error === "string") {
        content.push({
          type: "resource",
          resource: {
            text: sanitizedOutput.error as string,
            mimeType:
              INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXECUTE_TABLES_QUERY_ERROR,
            uri: "",
          },
        });
      } else {
        const queryTitle = getTablesQueryResultsFileTitle({
          output: sanitizedOutput,
        });

        // Generate the CSV file.
        const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(auth, {
          title: queryTitle,
          conversationId: agentLoopRunContext.conversation.sId,
          results,
        });

        // Upload the CSV file to the conversation data source.
        await uploadFileToConversationDataSource({
          auth,
          file: csvFile,
        });

        // Append the CSV file to the output of the tool as an agent-generated file.
        content.push({
          type: "resource",
          resource: {
            text: "Your query results were generated successfully. They are available as a structured CSV file.",
            uri: csvFile.getPublicUrl(auth),
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
            fileId: csvFile.sId,
            title: queryTitle,
            contentType: csvFile.contentType,
            snippet: csvSnippet,
          },
        });

        // Check if we should generate a section JSON file.
        const shouldGenerateSectionFile = results.some((result) =>
          Object.values(result).some(
            (value) =>
              typeof value === "string" &&
              value.length > TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH
          )
        );

        if (shouldGenerateSectionFile) {
          // First, we fetch the connector provider for the data source, cause the chunking
          // strategy of the section file depends on it: Since all tables are from the same
          // data source, we can just take the first table's data source view id.
          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            tableConfigurations[0].dataSourceViewId
          );
          const connectorProvider =
            dataSourceView?.dataSource?.connectorProvider ?? null;
          const sectionColumnsPrefix =
            getSectionColumnsPrefix(connectorProvider);

          // Generate the section file.
          const sectionFile = await generateSectionFile(auth, {
            title: queryTitle,
            conversationId: agentLoopRunContext.conversation.sId,
            results,
            sectionColumnsPrefix,
          });

          // Upload the section file to the conversation data source.
          await uploadFileToConversationDataSource({
            auth,
            file: sectionFile,
          });

          // Append the section file to the output of the tool as an agent-generated file.
          content.push({
            type: "resource",
            resource: {
              text: "Results are also available as a rich text file that can be searched.",
              uri: sectionFile.getPublicUrl(auth),
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              fileId: sectionFile.sId,
              title: `${queryTitle} (Rich Text)`,
              contentType: sectionFile.contentType,
              snippet: null,
            },
          });
        }
      }

      return {
        isError: false,
        content,
      };
    }
  );

  return server;
}

function getTablesQueryResultsFileTitle({
  output,
}: {
  output: Record<string, unknown> | null;
}): string {
  return typeof output?.query_title === "string"
    ? output.query_title
    : "query_results";
}

function getTablesQueryError(error: string) {
  switch (error) {
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
}

/**
 * Get the prefix for a row in a section file.
 * This prefix is used to identify the row in the section file.
 * We currently only support Salesforce since it's the only connector for which we can generate a prefix.
 */
export function getSectionColumnsPrefix(
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
    case "slack_bot":
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

export default createServer;
