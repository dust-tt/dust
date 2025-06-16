import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ExecuteTablesQueryMarkerResourceType,
  GetDatabaseSchemaMarkerResourceType,
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import {
  getSectionColumnsPrefix,
  TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server";
import type { ResolvedTableConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  fetchAgentTableConfiguration,
  parseTableConfigurationURI,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { CSVRecord } from "@app/lib/api/csv";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types";
import { CoreAPI } from "@app/types/core/core_api";

// Types for the resources that are output by the tools of this server.
type TablesQueryOutputResources =
  | ThinkingOutputType
  | SqlQueryOutputType
  | ToolGeneratedFileType
  | GetDatabaseSchemaMarkerResourceType
  | ExecuteTablesQueryMarkerResourceType;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "query_tables_v2",
  version: "1.0.0",
  description:
    "Tables, Spreadsheets, Notion DBs (quantitative) (mcp, exploded).",
  icon: "ActionTableIcon",
  authorization: null,
  documentationUrl: null,
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_database_schema",
    "Retrieves the database schema. You MUST call this tool at least once before attempting to query tables to understand their structure. This tool provides essential information about table columns, types, and relationships needed to write accurate SQL queries.",
    {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
    },
    async ({ tables }) => {
      // Parse and resolve table configurations
      const resolvedTableConfigurations: ResolvedTableConfiguration[] = [];
      const dataSourceViewModelIdsToFetch = new Set<number>();

      for (const tableConfig of tables) {
        const configInfoRes = parseTableConfigurationURI(tableConfig.uri);
        if (configInfoRes.isErr()) {
          return makeMCPToolTextError(
            `Error parsing table configuration: ${configInfoRes.error.message}`
          );
        }

        const configInfo = configInfoRes.value;

        switch (configInfo.type) {
          case "database": {
            const agentTableConfigRes = await fetchAgentTableConfiguration(
              configInfo.sId
            );
            if (agentTableConfigRes.isErr()) {
              return makeMCPToolTextError(
                `Error fetching table configuration: ${agentTableConfigRes.error.message}`
              );
            }
            const agentTableConfig = agentTableConfigRes.value;
            dataSourceViewModelIdsToFetch.add(
              agentTableConfig.dataSourceViewId
            );

            resolvedTableConfigurations.push({
              tableId: agentTableConfig.tableId,
              dataSourceViewId: String(agentTableConfig.dataSourceViewId),
              workspaceId: auth.getNonNullableWorkspace().sId,
            });
            break;
          }

          case "dynamic": {
            const dataSourceView = await DataSourceViewResource.fetchById(
              auth,
              configInfo.dataSourceViewId
            );
            if (!dataSourceView) {
              return makeMCPToolTextError(
                `Data source view not found: ${configInfo.dataSourceViewId}`
              );
            }
            dataSourceViewModelIdsToFetch.add(dataSourceView.id);

            for (const tableId of configInfo.tableIds) {
              resolvedTableConfigurations.push({
                tableId,
                dataSourceViewId: String(dataSourceView.id),
                workspaceId: auth.getNonNullableWorkspace().sId,
              });
            }
            break;
          }

          default:
            assertNever(configInfo);
        }
      }

      if (resolvedTableConfigurations.length === 0) {
        return makeMCPToolTextError(
          "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool."
        );
      }

      const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
        auth,
        Array.from(dataSourceViewModelIdsToFetch)
      );
      const dataSourceViewsMap = new Map(
        dataSourceViews.map((dsv) => [String(dsv.id), dsv])
      );

      // Call Core API's /database_schema endpoint
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const schemaResult = await coreAPI.getDatabaseSchema({
        tables: resolvedTableConfigurations.map((t) => {
          const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
          if (
            !dataSourceView ||
            !dataSourceView.dataSource.dustAPIDataSourceId
          ) {
            throw new Error(
              `Missing data source ID for view ${t.dataSourceViewId}`
            );
          }
          return {
            project_id: parseInt(dataSourceView.dataSource.dustAPIProjectId),
            data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
            table_id: t.tableId,
          };
        }),
      });

      if (schemaResult.isErr()) {
        return makeMCPToolTextError(
          `Error retrieving database schema: ${schemaResult.error.message}`
        );
      }

      return {
        isError: false,
        content: [
          {
            type: "resource",
            resource: {
              text: "get_database_schema_marker",
              mimeType:
                INTERNAL_MIME_TYPES.TOOL_OUTPUT.GET_DATABASE_SCHEMA_MARKER,
              uri: "",
            },
          },
          ...getSchemaContent(schemaResult.value.schemas),
          ...getQueryWritingInstructionsContent(schemaResult.value.dialect),
          ...getDatabaseExampleRowsContent(schemaResult.value.schemas),
        ],
      };
    }
  );

  server.tool(
    "execute_database_query",
    "Executes a query on the database. You MUST call the get_database_schema tool for that database at least once before attempting to execute a query. The query must respect the guidelines and schema provided by the get_database_schema tool.",
    {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
      query: z
        .string()
        .describe(
          "The query to execute. Must respect the guidelines provided by the `get_database_schema` tool."
        ),
      fileName: z
        .string()
        .describe("The name of the file to save the results to."),
    },
    withToolLogging(
      auth,
      "tables_query",
      async ({ tables, query, fileName }) => {
        // TODO(mcp): @fontanierh: we should not have a strict dependency on the agentLoopRunContext.
        if (!agentLoopContext?.runContext) {
          throw new Error("Unreachable: missing agentLoopContext.");
        }

        const agentLoopRunContext = agentLoopContext.runContext;

        // Parse and resolve table configurations
        const resolvedTableConfigurations: ResolvedTableConfiguration[] = [];
        const dataSourceViewModelIdsToFetch = new Set<number>();

        for (const tableConfig of tables) {
          const configInfoRes = parseTableConfigurationURI(tableConfig.uri);
          if (configInfoRes.isErr()) {
            return makeMCPToolTextError(
              `Error parsing table configuration: ${configInfoRes.error.message}`
            );
          }

          const configInfo = configInfoRes.value;

          switch (configInfo.type) {
            case "database": {
              const agentTableConfigRes = await fetchAgentTableConfiguration(
                configInfo.sId
              );
              if (agentTableConfigRes.isErr()) {
                return makeMCPToolTextError(
                  `Error fetching table configuration: ${agentTableConfigRes.error.message}`
                );
              }
              const agentTableConfig = agentTableConfigRes.value;
              dataSourceViewModelIdsToFetch.add(
                agentTableConfig.dataSourceViewId
              );

              resolvedTableConfigurations.push({
                tableId: agentTableConfig.tableId,
                dataSourceViewId: String(agentTableConfig.dataSourceViewId),
                workspaceId: auth.getNonNullableWorkspace().sId,
              });
              break;
            }

            case "dynamic": {
              const dataSourceView = await DataSourceViewResource.fetchById(
                auth,
                configInfo.dataSourceViewId
              );
              if (!dataSourceView) {
                return makeMCPToolTextError(
                  `Data source view not found: ${configInfo.dataSourceViewId}`
                );
              }
              dataSourceViewModelIdsToFetch.add(dataSourceView.id);

              for (const tableId of configInfo.tableIds) {
                resolvedTableConfigurations.push({
                  tableId,
                  dataSourceViewId: String(dataSourceView.id),
                  workspaceId: auth.getNonNullableWorkspace().sId,
                });
              }
              break;
            }

            default:
              assertNever(configInfo);
          }
        }

        if (resolvedTableConfigurations.length === 0) {
          return makeMCPToolTextError(
            "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool."
          );
        }
        const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
          auth,
          Array.from(dataSourceViewModelIdsToFetch)
        );
        const dataSourceViewsMap = new Map(
          dataSourceViews.map((dsv) => [String(dsv.id), dsv])
        );

        // Call Core API's /query_database endpoint
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const queryResult = await coreAPI.queryDatabase({
          tables: resolvedTableConfigurations.map((t) => {
            const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
            if (
              !dataSourceView ||
              !dataSourceView.dataSource.dustAPIDataSourceId
            ) {
              throw new Error(
                `Missing data source ID for view ${t.dataSourceViewId}`
              );
            }
            return {
              project_id: parseInt(dataSourceView.dataSource.dustAPIProjectId),
              data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
              table_id: t.tableId,
            };
          }),
          query,
        });
        if (queryResult.isErr()) {
          return {
            isError: true,
            content: [
              {
                type: "resource",
                resource: {
                  text: "execute_tables_query_marker",
                  mimeType:
                    INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXECUTE_TABLES_QUERY_MARKER,
                  uri: "",
                },
              },
              {
                type: "resource",
                resource: {
                  text:
                    "Error executing database query: " +
                    queryResult.error.message,
                  mimeType:
                    INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXECUTE_TABLES_QUERY_ERROR,
                  uri: "",
                },
              },
            ],
          };
        }

        const content: {
          type: "resource";
          resource: TablesQueryOutputResources;
        }[] = [];

        const results: CSVRecord[] = queryResult.value.results
          .map((r) => r.value)
          .filter(
            (record) =>
              record !== undefined &&
              record !== null &&
              typeof record === "object"
          );

        content.push({
          type: "resource",
          resource: {
            text: "tables_query_v2",
            mimeType:
              INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXECUTE_TABLES_QUERY_MARKER,
            uri: "",
          },
        });

        if (results.length > 0) {
          // date in yyyy-mm-dd
          const humanReadableDate = new Date().toISOString().split("T")[0];
          const queryTitle = `${fileName} (${humanReadableDate})`;

          // Generate the CSV file.
          const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(
            auth,
            {
              title: queryTitle,
              conversationId: agentLoopRunContext.conversation.sId,
              results,
            }
          );

          // Upload the CSV file to the conversation data source.
          await uploadFileToConversationDataSource({
            auth,
            file: csvFile,
          });

          // Append the CSV file to the output of the tool as an agent-generated file.
          content.push({
            type: "resource",
            resource: {
              text: `Your query results were generated successfully.`,
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
            const firstViewId = resolvedTableConfigurations[0].dataSourceViewId;
            const dataSourceView = dataSourceViewsMap.get(firstViewId);
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
                text: "Your query results were generated successfully.",
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
    )
  );

  return server;
}

export default createServer;
