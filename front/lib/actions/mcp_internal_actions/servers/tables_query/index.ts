import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  EXECUTE_DATABASE_QUERY_TOOL_NAME,
  GET_DATABASE_SCHEMA_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
  ToolMarkerResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  EXECUTE_TABLES_QUERY_MARKER,
  GET_DATABASE_SCHEMA_MARKER,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import { fetchTableDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { CSVRecord } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import type { ConnectorProvider } from "@app/types";
import { Err, Ok } from "@app/types";
import { CoreAPI } from "@app/types/core/core_api";

/**
 * Get the prefix for a row in a section file.
 * This prefix is used to identify the row in the section file.
 * We currently only support Salesforce since it's the only connector for which we can generate a prefix.
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
    case "slack_bot":
    case "slack":
    case "microsoft":
    case "microsoft_bot":
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

const TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH = 500;

// Types for the resources that are output by the tools of this server.
type TablesQueryOutputResources =
  | ThinkingOutputType
  | SqlQueryOutputType
  | ToolGeneratedFileType
  | ToolMarkerResourceType;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("query_tables_v2");

  server.tool(
    GET_DATABASE_SCHEMA_TOOL_NAME,
    "Retrieves the database schema. You MUST call this tool at least once before attempting to query tables to understand their structure. This tool provides essential information about table columns, types, and relationships needed to write accurate SQL queries.",
    {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GET_DATABASE_SCHEMA_TOOL_NAME,
        agentLoopContext,
      },
      async ({ tables }) => {
        // Fetch table configurations
        const tableConfigurationsRes = await fetchTableDataSourceConfigurations(
          auth,
          tables
        );
        if (tableConfigurationsRes.isErr()) {
          return new Err(
            new MCPError(
              `Error fetching table configurations: ${tableConfigurationsRes.error.message}`
            )
          );
        }
        const tableConfigurations = tableConfigurationsRes.value;
        if (tableConfigurations.length === 0) {
          return new Ok([
            {
              type: "text",
              text: "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
            },
          ]);
        }
        const dataSourceViews = await DataSourceViewResource.fetchByIds(auth, [
          ...new Set(tableConfigurations.map((t) => t.dataSourceViewId)),
        ]);

        // Security check: Verify user has canRead access to all data source views
        const unreadableViews = dataSourceViews.filter(
          (dsv) => !dsv.canRead(auth)
        );
        if (unreadableViews.length > 0) {
          return new Err(
            new MCPError(
              `Access denied: You do not have read permission for ${unreadableViews.length} data source view(s).`
            )
          );
        }

        const dataSourceViewsMap = new Map(
          dataSourceViews.map((dsv) => [dsv.sId, dsv])
        );

        // Call Core API's /database_schema endpoint
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        const schemaResult = await coreAPI.getDatabaseSchema({
          tables: tableConfigurations.map((t) => {
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
          return new Err(
            new MCPError(
              `Error retrieving database schema: ${schemaResult.error.message}`
            )
          );
        }

        return new Ok([
          {
            type: "resource",
            resource: {
              text: GET_DATABASE_SCHEMA_MARKER,
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
              uri: "",
            },
          },
          ...getSchemaContent(schemaResult.value.schemas),
          ...getQueryWritingInstructionsContent(schemaResult.value.dialect),
          ...getDatabaseExampleRowsContent(schemaResult.value.schemas),
        ]);
      }
    )
  );

  server.tool(
    EXECUTE_DATABASE_QUERY_TOOL_NAME,
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
      {
        toolNameForMonitoring: EXECUTE_DATABASE_QUERY_TOOL_NAME,
        agentLoopContext,
      },
      async ({ tables, query, fileName }) => {
        // TODO(mcp): @fontanierh: we should not have a strict dependency on the agentLoopRunContext.
        if (!agentLoopContext?.runContext) {
          throw new Error("Unreachable: missing agentLoopContext.");
        }

        const agentLoopRunContext = agentLoopContext.runContext;

        // Fetch table configurations
        const tableConfigurationsRes = await fetchTableDataSourceConfigurations(
          auth,
          tables
        );
        if (tableConfigurationsRes.isErr()) {
          return new Err(
            new MCPError(
              `Error fetching table configurations: ${tableConfigurationsRes.error.message}`
            )
          );
        }
        const tableConfigurations = tableConfigurationsRes.value;
        if (tableConfigurations.length === 0) {
          return new Err(
            new MCPError(
              "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
              { tracked: false }
            )
          );
        }
        const dataSourceViews = await DataSourceViewResource.fetchByIds(auth, [
          ...new Set(tableConfigurations.map((t) => t.dataSourceViewId)),
        ]);

        // Security check: Verify user has canRead access to all data source views
        const unreadableViews = dataSourceViews.filter(
          (dsv) => !dsv.canRead(auth)
        );
        if (unreadableViews.length > 0) {
          return new Err(
            new MCPError(
              `Access denied: You do not have read permission for ${unreadableViews.length} data source view(s).`
            )
          );
        }

        const dataSourceViewsMap = new Map(
          dataSourceViews.map((dsv) => [dsv.sId, dsv])
        );
        const dataSourceView = await DataSourceViewResource.fetchById(
          auth,
          tableConfigurations[0].dataSourceViewId
        );
        const connectorProvider =
          dataSourceView?.dataSource?.connectorProvider ?? null;
        return executeQuery(auth, {
          tables: tableConfigurations.map((t) => {
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
          conversationId: agentLoopRunContext.conversation.sId,
          fileName,
          connectorProvider,
        });
      }
    )
  );

  return server;
}

export async function executeQuery(
  auth: Authenticator,
  {
    tables,
    query,
    conversationId,
    fileName,
    connectorProvider,
  }: {
    tables: Array<{
      project_id: number;
      data_source_id: string;
      table_id: string;
    }>;
    query: string;
    conversationId: string;
    fileName: string;
    connectorProvider: ConnectorProvider | null;
  }
) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const queryResult = await coreAPI.queryDatabase({
    tables,
    query,
  });
  if (queryResult.isErr()) {
    return new Err(
      // Certain errors we don't track as they can occur in the context of a normal execution.
      new MCPError(
        "Error executing database query: " + queryResult.error.message,
        { tracked: false }
      )
    );
  }

  const content: {
    type: "resource";
    resource: TablesQueryOutputResources;
  }[] = [];

  const results: CSVRecord[] = queryResult.value.results
    .map((r) => r.value)
    .filter(
      (record) =>
        record !== undefined && record !== null && typeof record === "object"
    );

  content.push({
    type: "resource",
    resource: {
      text: EXECUTE_TABLES_QUERY_MARKER,
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
      uri: "",
    },
  });

  if (results.length > 0) {
    // date in yyyy-mm-dd
    const humanReadableDate = new Date().toISOString().split("T")[0];
    const queryTitle = `${fileName} (${humanReadableDate})`;

    // Generate the CSV file.
    const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(auth, {
      title: queryTitle,
      conversationId,
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
      const sectionColumnsPrefix = getSectionColumnsPrefix(connectorProvider);

      // Generate the section file.
      const sectionFile = await generateSectionFile(auth, {
        title: queryTitle,
        conversationId,
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

  return new Ok(content);
}

export default createServer;
