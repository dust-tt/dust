import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolResultContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import {
  getSectionColumnsPrefix,
  TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/server";
import { fetchAgentTableConfigurations } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { CSVRecord } from "@app/lib/api/csv";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "query_tables_v2",
  version: "1.0.0",
  description:
    "Tables, Spreadsheets, Notion DBs (quantitative) (mcp, exploded).",
  icon: "ActionTableIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopRunContext?: AgentLoopRunContextType
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
      // Fetch table configurations
      const agentTableConfigurationsRes = await fetchAgentTableConfigurations(
        auth,
        tables
      );
      if (agentTableConfigurationsRes.isErr()) {
        return makeMCPToolTextError(
          `Error fetching table configurations: ${agentTableConfigurationsRes.error.message}`
        );
      }
      const agentTableConfigurations = agentTableConfigurationsRes.value;
      if (agentTableConfigurations.length === 0) {
        return makeMCPToolTextError(
          "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool."
        );
      }
      const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
        auth,
        [...new Set(agentTableConfigurations.map((t) => t.dataSourceViewId))]
      );
      const dataSourceViewsMap = new Map(
        dataSourceViews.map((dsv) => [dsv.id, dsv])
      );

      // Format table identifiers for Core API call
      const configuredTables: Array<[number, string, string]> = [];
      for (const t of agentTableConfigurations) {
        const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
        if (!dataSourceView || !dataSourceView.dataSource.dustAPIDataSourceId) {
          throw new Error(
            `Missing data source ID for view ${t.dataSourceViewId}`
          );
        }

        configuredTables.push([
          parseInt(dataSourceView.dataSource.dustAPIProjectId, 10),
          dataSourceView.dataSource.dustAPIDataSourceId,
          t.tableId,
        ]);
      }

      // Call Core API's /database_schema endpoint
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const schemaResult = await coreAPI.getDatabaseSchema({
        tables: configuredTables.map(([projectId, dataSourceId, tableId]) => ({
          project_id: projectId.toString(),
          data_source_id: dataSourceId,
          table_id: tableId,
        })),
      });
      if (schemaResult.isErr()) {
        return makeMCPToolTextError(
          `Error retrieving database schema: ${schemaResult.error.message}`
        );
      }

      return {
        isError: false,
        content: [
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
    async ({ tables, query, fileName }) => {
      // TODO(mcp): @fontanierh: we should not have a strict dependency on the agentLoopRunContext.
      if (!agentLoopRunContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      // Fetch table configurations
      const agentTableConfigurationsRes = await fetchAgentTableConfigurations(
        auth,
        tables
      );
      if (agentTableConfigurationsRes.isErr()) {
        return makeMCPToolTextError(
          `Error fetching table configurations: ${agentTableConfigurationsRes.error.message}`
        );
      }
      const agentTableConfigurations = agentTableConfigurationsRes.value;
      if (agentTableConfigurations.length === 0) {
        return makeMCPToolTextError(
          "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool."
        );
      }
      const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
        auth,
        [...new Set(agentTableConfigurations.map((t) => t.dataSourceViewId))]
      );
      const dataSourceViewsMap = new Map(
        dataSourceViews.map((dsv) => [dsv.id, dsv])
      );

      // Format table identifiers for Core API call
      const configuredTables: Array<[number, string, string]> = [];
      for (const t of agentTableConfigurations) {
        const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
        if (!dataSourceView || !dataSourceView.dataSource.dustAPIDataSourceId) {
          throw new Error(
            `Missing data source ID for view ${t.dataSourceViewId}`
          );
        }

        configuredTables.push([
          parseInt(dataSourceView.dataSource.dustAPIProjectId, 10),
          dataSourceView.dataSource.dustAPIDataSourceId,
          t.tableId,
        ]);
      }

      // Call Core API's /query_database endpoint
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const queryResult = await coreAPI.queryDatabase({
        tables: configuredTables.map(([projectId, dataSourceId, tableId]) => ({
          project_id: projectId.toString(),
          data_source_id: dataSourceId,
          table_id: tableId,
        })),
        query,
      });
      if (queryResult.isErr()) {
        return makeMCPToolTextError(
          `Error executing database query: ${queryResult.error.message}`
        );
      }

      const content: MCPToolResultContentType[] = [];

      const results: CSVRecord[] = queryResult.value.results
        .map((r) => r.value)
        .filter(
          (record) =>
            record !== undefined &&
            record !== null &&
            typeof record === "object"
        );

      if (results.length > 0) {
        const queryTitle = fileName;

        //TODO(mcp): return the CSV file itself as a MCP resource and let the other side handle it
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
            text: `Your query results were generated successfully.`,
            uri: csvFile.getPublicUrl(auth),
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
            fileId: csvFile.sId,
            title: queryTitle,
            contentType: csvFile.contentType,
            snippet: csvSnippet,
          },
        });

        //TODO(mcp) probably do the same for the section file
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
          const [dataSourceView] = await DataSourceViewResource.fetchByModelIds(
            auth,
            [agentTableConfigurations[0].dataSourceViewId]
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
  );

  return server;
}

export default createServer;
