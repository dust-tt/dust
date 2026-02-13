// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { MCPError } from "@app/lib/actions/mcp_errors";
import { GET_DATABASE_SCHEMA_MARKER } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
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
  QUERY_TABLES_V2_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/query_tables_v2/metadata";
import config from "@app/lib/api/config";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

const handlers: ToolHandlers<typeof QUERY_TABLES_V2_TOOLS_METADATA> = {
  [GET_DATABASE_SCHEMA_TOOL_NAME]: async ({ tables }, { auth }) => {
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
    const accessError = verifyDataSourceViewReadAccess(auth, dataSourceViews);
    if (accessError) {
      return new Err(accessError);
    }

    const dataSourceViewsMap = new Map(
      dataSourceViews.map((dsv) => [dsv.sId, dsv])
    );

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
    const accessError = verifyDataSourceViewReadAccess(auth, dataSourceViews);
    if (accessError) {
      return new Err(accessError);
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
