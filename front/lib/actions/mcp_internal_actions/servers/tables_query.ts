import {
  INTERNAL_MIME_TYPES,
  TABLE_CONFIGURATION_URI_PATTERN,
} from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Op } from "sequelize";

import { getTablesQueryResultsFileTitle } from "@app/components/actions/tables_query/utils";
import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { MCPToolResultContent } from "@app/lib/actions/mcp_actions";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { runActionStreamed } from "@app/lib/actions/server";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import type { CSVRecord } from "@app/lib/api/csv";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { LabsSalesforcePersonalConnectionResource } from "@app/lib/resources/labs_salesforce_personal_connection_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConnectorProvider,
  ConversationType,
  LightWorkspaceType,
  Result,
} from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

// We need a model with at least 32k tokens to run tables_query.
const TABLES_QUERY_MIN_TOKEN = 28_000;
const RENDERED_CONVERSATION_MIN_TOKEN = 4_000;
const TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH = 500;

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

async function fetchAgentTableConfigurations(
  owner: LightWorkspaceType,
  uris: string[]
): Promise<Result<AgentTablesQueryConfigurationTable[], Error>> {
  const configurationIds = [];
  for (const uri of uris) {
    const match = uri.match(TABLE_CONFIGURATION_URI_PATTERN);
    if (!match) {
      return new Err(
        new Error(`Invalid URI for a table configuration: ${uri}`)
      );
    }
    // Safe to do because the inputs are already checked against the zod schema here.
    const [, , tableConfigId] = match;
    const sIdParts = getResourceNameAndIdFromSId(tableConfigId);
    if (!sIdParts) {
      return new Err(
        new Error(`Invalid table configuration ID: ${tableConfigId}`)
      );
    }
    if (sIdParts.resourceName !== "table_configuration") {
      return new Err(
        new Error(`ID is not a table configuration ID: ${tableConfigId}`)
      );
    }
    if (sIdParts.workspaceModelId !== owner.id) {
      return new Err(
        new Error(
          `Table configuration ${tableConfigId} does not belong to workspace ${sIdParts.workspaceModelId}`
        )
      );
    }
    configurationIds.push(sIdParts.resourceModelId);
  }

  const agentTableConfigurations =
    await AgentTablesQueryConfigurationTable.findAll({
      where: {
        id: { [Op.in]: configurationIds },
      },
    });

  return new Ok(agentTableConfigurations);
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "tables_query",
  version: "1.0.0",
  description: "Tables, Spreadsheets, Notion DBs (quantitative).",
  icon: "GithubLogo",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  {
    agentConfiguration,
    actionConfiguration,
    conversation,
    agentMessage,
  }: {
    agentConfiguration?: AgentConfigurationType;
    actionConfiguration?: MCPToolConfigurationType;
    conversation?: ConversationType;
    agentMessage?: AgentMessageType;
  }
): McpServer {
  const server = new McpServer(serverInfo);

  let actionDescription =
    "Query data tables described below by executing a SQL query automatically generated from the conversation context. " +
    "The function does not require any inputs, the SQL query will be inferred from the conversation history.";
  if (actionConfiguration?.description) {
    actionDescription += `\nDescription of the data tables:\n${actionConfiguration.description}`;
  }

  server.tool(
    "tables_query",
    actionDescription,
    {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
    },
    async ({ tables }) => {
      if (
        !agentConfiguration ||
        !conversation ||
        !agentMessage ||
        !actionConfiguration
      ) {
        throw new Error(
          "Unreachable: missing agent configuration, conversation or agent message."
        );
      }

      const owner = auth.getNonNullableWorkspace();

      // TODO(mcp): if we stream events, here we want to inform that it has started.

      // Render conversation for the action.
      const supportedModel = getSupportedModelConfig(agentConfiguration.model);
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
        conversation,
        model: supportedModel,
        prompt: agentConfiguration.instructions ?? "",
        allowedTokenCount,
        excludeImages: true,
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

      const agentTableConfigurationsRes = await fetchAgentTableConfigurations(
        auth.getNonNullableWorkspace(),
        tables.map(({ uri }) => uri)
      );
      if (agentTableConfigurationsRes.isErr()) {
        return makeMCPToolTextError(
          `Error fetching table configurations: ${agentTableConfigurationsRes.error.message}`
        );
      }

      const agentTableConfigurations = agentTableConfigurationsRes.value;
      const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
        auth,
        [...new Set(agentTableConfigurations.map((t) => t.dataSourceViewId))]
      );

      const personalConnectionIds: Record<string, string> = {};

      // This is for Salesforce personal connections.
      const flags = await getFeatureFlags(owner);
      if (flags.includes("labs_salesforce_personal_connections")) {
        for (const dataSourceView of dataSourceViews) {
          if (dataSourceView.dataSource.connectorProvider === "salesforce") {
            const personalConnection =
              await LabsSalesforcePersonalConnectionResource.fetchByDataSource(
                auth,
                {
                  dataSource: dataSourceView.dataSource.toJSON(),
                }
              );
            if (personalConnection) {
              personalConnectionIds[dataSourceView.sId] =
                personalConnection.connectionId;
            } else {
              return makeMCPToolTextError(
                `The query requires authentication. Please connect to Salesforce.`
              );
            }
          }
        }
      }
      // End salesforce specific

      const dataSourceViewsMap = new Map(
        dataSourceViews.map((dsv) => [dsv.id, dsv])
      );
      const configuredTables = agentTableConfigurations.map((t) => ({
        workspace_id: owner.sId,
        table_id: t.tableId,
        // Note: This value is passed to the registry for lookup.
        // The registry will return the associated data source's dustAPIDataSourceId.
        data_source_id: dataSourceViewsMap.get(t.dataSourceViewId)?.sId,
        remote_database_secret_id: personalConnectionIds[t.dataSourceViewId],
      }));
      if (configuredTables.length === 0) {
        return makeMCPToolTextError(
          "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool."
        );
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
              workspaceId: owner.id,
              conversationId: conversation.id,
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
                workspaceId: owner.id,
                conversationId: conversation.id,
                error: e.error,
              },
              "Error running query_tables app"
            );
            return makeMCPToolTextError(getTablesQueryError(e.error).message);
          }

          if (event.content.block_name === "MODEL_OUTPUT") {
            // TODO(mcp): if we stream events, here we can yield an event with the model output.
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

      const content: MCPToolResultContent[] = [];

      const rawResults =
        "results" in sanitizedOutput ? sanitizedOutput.results : [];
      let results: CSVRecord[] = [];

      if (Array.isArray(rawResults)) {
        results = rawResults.filter(
          (record) =>
            record !== undefined &&
            record !== null &&
            typeof record === "object"
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
        content.push({
          type: "resource",
          resource: {
            uri: csvFile.sId,
            text: `${queryTitle} - ${csvFile.snippet}`,
            mimeType: csvFile.contentType,
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

        let sectionFile: FileResource | null = null;
        if (shouldGenerateSectionFile) {
          // First, we fetch the connector provider for the data source, cause the chunking
          // strategy of the section file depends on it: Since all tables are from the same
          // data source, we can just take the first table's data source view id.
          const [dataSourceView] = await DataSourceViewResource.fetchByModelIds(
            auth,
            [agentTableConfigurations[0].dataSourceViewId]
          );
          const connectorProvider =
            dataSourceView?.dataSource?.connectorProvider ?? null;
          const sectionColumnsPrefix =
            getSectionColumnsPrefix(connectorProvider);

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

          content.push({
            type: "resource",
            resource: {
              uri: sectionFile.sId,
              text: `${queryTitle} ${sectionFile.snippet}`,
              mimeType: sectionFile.contentType,
            },
          });
        }

        delete sanitizedOutput.results;
        updateParams.resultsFileId = csvFile.id;
        updateParams.resultsFileSnippet = csvSnippet;
        updateParams.sectionFileId = sectionFile?.id ?? null;
      }

      // // Updating action
      // await action.update({
      //   ...updateParams,
      //   output: sanitizedOutput,
      //   runId: await dustRunId,
      // });

      content.push({ type: "text", text: JSON.stringify(sanitizedOutput) });

      return {
        isError: false,
        content: content,
      };
    }
  );

  return server;
}

export default createServer;
