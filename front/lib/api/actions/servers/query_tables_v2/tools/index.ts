import { MCPError } from "@app/lib/actions/mcp_errors";
import type { TablesConfigurationToolType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { GET_DATABASE_SCHEMA_MARKER } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { fetchTableDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import {
  executeQuery,
  verifyDataSourceViewReadAccess,
} from "@app/lib/api/actions/servers/query_tables_v2/helpers";
import {
  EXECUTE_DATABASE_QUERY_TOOL_NAME,
  GET_DATABASE_SCHEMA_TOOL_NAME,
  LIST_TABLES_TOOL_NAME,
  QUERY_TABLES_V2_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/query_tables_v2/metadata";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/api/actions/servers/tables_query/schema";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

function tablesFromUris(tableUris: string[]): TablesConfigurationToolType {
  return tableUris.map((uri) => ({
    uri,
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
  }));
}

async function resolveTableConfigurations(
  auth: Authenticator,
  tables: TablesConfigurationToolType
) {
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
    return new Ok({
      tableConfigurations: [],
      dataSourceViewsMap: new Map<
        string,
        Awaited<ReturnType<typeof DataSourceViewResource.fetchByIds>>[number]
      >(),
    });
  }

  const dataSourceViews = await DataSourceViewResource.fetchByIds(auth, [
    ...new Set(tableConfigurations.map((t) => t.dataSourceViewId)),
  ]);

  const accessError = verifyDataSourceViewReadAccess(auth, dataSourceViews);
  if (accessError) {
    return new Err(accessError);
  }

  return new Ok({
    tableConfigurations,
    dataSourceViewsMap: new Map(dataSourceViews.map((dsv) => [dsv.sId, dsv])),
  });
}

const handlers: ToolHandlers<typeof QUERY_TABLES_V2_TOOLS_METADATA> = {
  [LIST_TABLES_TOOL_NAME]: async ({ tables }, { auth }) => {
    const resolvedRes = await resolveTableConfigurations(auth, tables);
    if (resolvedRes.isErr()) {
      return resolvedRes;
    }

    const { tableConfigurations, dataSourceViewsMap } = resolvedRes.value;
    if (tableConfigurations.length === 0) {
      return new Ok([
        {
          type: "text",
          text: "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
        },
      ]);
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const listedTables = await concurrentExecutor(
      tables.map((tableInput, index) => ({
        uri: tableInput.uri,
        tableConfiguration: tableConfigurations[index],
      })),
      async ({ uri, tableConfiguration }) => {
        const dataSourceView = dataSourceViewsMap.get(
          tableConfiguration.dataSourceViewId
        );
        if (!dataSourceView || !dataSourceView.dataSource.dustAPIDataSourceId) {
          return {
            uri,
            tableId: tableConfiguration.tableId,
            error: "Table configuration is outdated or inaccessible.",
          };
        }

        const tableResult = await coreAPI.getTable({
          projectId: dataSourceView.dataSource.dustAPIProjectId,
          dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
          tableId: tableConfiguration.tableId,
          viewFilter: dataSourceView.toViewFilter(),
        });

        if (tableResult.isErr()) {
          return {
            uri,
            tableId: tableConfiguration.tableId,
            error: tableResult.error.message,
          };
        }

        const { table } = tableResult.value;
        return {
          uri,
          tableId: table.table_id,
          name: table.name,
          title: table.title,
          description: table.description,
        };
      },
      { concurrency: 10 }
    );

    return new Ok([
      {
        type: "text",
        text: JSON.stringify({ tables: listedTables }, null, 2),
      },
    ]);
  },

  [GET_DATABASE_SCHEMA_TOOL_NAME]: async ({ tableUris }, { auth }) => {
    const tables = tablesFromUris(tableUris);
    const resolvedRes = await resolveTableConfigurations(auth, tables);
    if (resolvedRes.isErr()) {
      return resolvedRes;
    }

    const { tableConfigurations, dataSourceViewsMap } = resolvedRes.value;
    if (tableConfigurations.length === 0) {
      return new Ok([
        {
          type: "text",
          text: "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
        },
      ]);
    }

    // Build table list, filtering out invalid configurations
    const validTables: Array<{
      project_id: number;
      data_source_id: string;
      table_id: string;
    }> = [];
    const invalidTableIds: string[] = [];
    for (const t of tableConfigurations) {
      const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
      if (dataSourceView && dataSourceView.dataSource.dustAPIDataSourceId) {
        validTables.push({
          project_id: parseInt(dataSourceView.dataSource.dustAPIProjectId),
          data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
          table_id: t.tableId,
        });
      } else {
        invalidTableIds.push(t.tableId);
      }
    }

    if (validTables.length === 0) {
      return new Ok([
        {
          type: "text",
          text: "The agent does not have access to any valid tables. Some table configurations may be outdated.",
        },
      ]);
    }

    // Call Core API's /database_schema endpoint
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const schemaResult = await coreAPI.getDatabaseSchema({
      tables: validTables,
    });

    if (schemaResult.isErr()) {
      return new Err(
        new MCPError(
          `Error retrieving database schema: ${schemaResult.error.message}`,
          { tracked: false }
        )
      );
    }

    const warning =
      invalidTableIds.length > 0
        ? [
            {
              type: "text" as const,
              text: `Warning: ${invalidTableIds.length} table(s) could not be loaded (${invalidTableIds.join(", ")}). Their configurations may be outdated.`,
            },
          ]
        : [];

    return new Ok([
      ...warning,
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
  },

  [EXECUTE_DATABASE_QUERY_TOOL_NAME]: async (
    { tables, query, fileName },
    { auth, agentLoopContext }
  ) => {
    // TODO(mcp): @fontanierh: we should not have a strict dependency on the agentLoopRunContext.
    if (!agentLoopContext?.runContext) {
      throw new Error("Unreachable: missing agentLoopContext.");
    }

    const agentLoopRunContext = agentLoopContext.runContext;

    const resolvedRes = await resolveTableConfigurations(auth, tables);
    if (resolvedRes.isErr()) {
      return resolvedRes;
    }

    const { tableConfigurations, dataSourceViewsMap } = resolvedRes.value;
    if (tableConfigurations.length === 0) {
      return new Err(
        new MCPError(
          "The agent does not have access to any tables. Please edit the agent's Query Tables tool to add tables, or remove the tool.",
          { tracked: false }
        )
      );
    }

    const dataSourceView = await DataSourceViewResource.fetchById(
      auth,
      tableConfigurations[0].dataSourceViewId
    );
    const connectorProvider =
      dataSourceView?.dataSource?.connectorProvider ?? null;
    return executeQuery(auth, {
      tables: tableConfigurations.map((t) => {
        const dataSourceView = dataSourceViewsMap.get(t.dataSourceViewId);
        if (!dataSourceView || !dataSourceView.dataSource.dustAPIDataSourceId) {
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
  },
};

export const TOOLS = buildTools(QUERY_TABLES_V2_TOOLS_METADATA, handlers);
