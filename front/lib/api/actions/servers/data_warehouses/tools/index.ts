// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getDatabaseExampleRowsContent,
  getQueryWritingInstructionsContent,
  getSchemaContent,
} from "@app/lib/actions/mcp_internal_actions/servers/tables_query/schema";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getAgentDataSourceConfigurations } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import {
  getAvailableWarehouses,
  getWarehouseNodes,
  makeBrowseResource,
  validateTables,
} from "@app/lib/api/actions/servers/data_warehouses/helpers";
import { DATA_WAREHOUSES_TOOLS_METADATA } from "@app/lib/api/actions/servers/data_warehouses/metadata";
import { executeQuery } from "@app/lib/api/actions/servers/query_tables_v2/helpers";
import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const handlers: ToolHandlers<typeof DATA_WAREHOUSES_TOOLS_METADATA> = {
  list: async ({ nodeId, limit, nextPageCursor, dataSources }, extra) => {
    const { auth } = extra;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

    const dataSourceConfigurationsResult =
      await getAgentDataSourceConfigurations(
        auth,
        dataSources.map((ds) => ({
          ...ds,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        }))
      );

    if (dataSourceConfigurationsResult.isErr()) {
      return dataSourceConfigurationsResult;
    }

    const agentDataSourceConfigurations = dataSourceConfigurationsResult.value;

    const authRes = await ensureAuthorizedDataSourceViews(
      auth,
      agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
    );
    if (authRes.isErr()) {
      return new Err(authRes.error);
    }

    const result =
      nodeId === null
        ? await getAvailableWarehouses(auth, agentDataSourceConfigurations, {
            limit: effectiveLimit,
            nextPageCursor,
          })
        : await getWarehouseNodes(auth, agentDataSourceConfigurations, {
            nodeId,
            limit: effectiveLimit,
            nextPageCursor,
          });

    if (result.isErr()) {
      return new Err(result.error);
    }

    const { nodes, nextPageCursor: newCursor } = result.value;

    return new Ok([
      {
        type: "resource" as const,
        resource: makeBrowseResource({
          nodeId,
          nodes,
          nextPageCursor: newCursor,
          resultCount: dataSources.length,
        }),
      },
    ]);
  },

  find: async (
    { query, rootNodeId, limit, nextPageCursor, dataSources },
    extra
  ) => {
    const { auth } = extra;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

    const dataSourceConfigurationsResult =
      await getAgentDataSourceConfigurations(
        auth,
        dataSources.map((ds) => ({
          ...ds,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        }))
      );

    if (dataSourceConfigurationsResult.isErr()) {
      return dataSourceConfigurationsResult;
    }

    const agentDataSourceConfigurations = dataSourceConfigurationsResult.value;

    const authRes = await ensureAuthorizedDataSourceViews(
      auth,
      agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
    );
    if (authRes.isErr()) {
      return new Err(authRes.error);
    }

    const result = await getWarehouseNodes(
      auth,
      agentDataSourceConfigurations,
      {
        nodeId: rootNodeId ?? null,
        query,
        limit: effectiveLimit,
        nextPageCursor,
      }
    );

    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const { nodes, nextPageCursor: newCursor } = result.value;

    return new Ok([
      {
        type: "resource" as const,
        resource: makeBrowseResource({
          nodeId: rootNodeId ?? null,
          nodes,
          nextPageCursor: newCursor,
          resultCount: dataSources.length,
        }),
      },
    ]);
  },

  describe_tables: async ({ dataSources, tableIds }, extra) => {
    const { auth } = extra;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const dataSourceConfigurationsResult =
      await getAgentDataSourceConfigurations(
        auth,
        dataSources.map((ds) => ({
          ...ds,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        }))
      );

    if (dataSourceConfigurationsResult.isErr()) {
      return dataSourceConfigurationsResult;
    }

    const agentDataSourceConfigurations = dataSourceConfigurationsResult.value;

    const authRes = await ensureAuthorizedDataSourceViews(
      auth,
      agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
    );
    if (authRes.isErr()) {
      return new Err(authRes.error);
    }

    const validationResult = await validateTables(
      auth,
      tableIds,
      agentDataSourceConfigurations
    );

    if (validationResult.isErr()) {
      return validationResult;
    }

    const { validatedNodes, dataSourceId } = validationResult.value;

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);

    if (!dataSource) {
      return new Err(
        new MCPError("Data source not found", {
          tracked: false,
        })
      );
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const schemaResult = await coreAPI.getDatabaseSchema({
      tables: validatedNodes.map((node) => ({
        project_id: parseInt(dataSource.dustAPIProjectId, 10),
        data_source_id: dataSource.dustAPIDataSourceId,
        table_id: node.node_id,
      })),
    });

    if (schemaResult.isErr()) {
      return new Err(
        new MCPError(
          `Error retrieving database schema: ${schemaResult.error.message}`
        )
      );
    }

    return new Ok([
      ...getSchemaContent(schemaResult.value.schemas),
      ...getQueryWritingInstructionsContent(schemaResult.value.dialect),
      ...getDatabaseExampleRowsContent(schemaResult.value.schemas),
    ]);
  },

  query: async ({ dataSources, tableIds, query, fileName }, extra) => {
    const { auth, agentLoopContext } = extra;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    if (!agentLoopContext?.runContext) {
      return new Err(
        new MCPError("Missing agentLoopContext for file generation")
      );
    }

    const agentLoopRunContext = agentLoopContext.runContext;

    const dataSourceConfigurationsResult =
      await getAgentDataSourceConfigurations(
        auth,
        dataSources.map((ds) => ({
          ...ds,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
        }))
      );

    if (dataSourceConfigurationsResult.isErr()) {
      return dataSourceConfigurationsResult;
    }

    const agentDataSourceConfigurations = dataSourceConfigurationsResult.value;

    const authRes = await ensureAuthorizedDataSourceViews(
      auth,
      agentDataSourceConfigurations.map((c) => c.dataSourceViewId)
    );
    if (authRes.isErr()) {
      return new Err(authRes.error);
    }

    const validationResult = await validateTables(
      auth,
      tableIds,
      agentDataSourceConfigurations
    );

    if (validationResult.isErr()) {
      return validationResult;
    }

    const { validatedNodes, dataSourceId } = validationResult.value;

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);

    if (!dataSource) {
      return new Err(
        new MCPError("Data source not found", {
          tracked: false,
        })
      );
    }

    const connectorProvider = dataSource.connectorProvider;

    return executeQuery(auth, {
      tables: validatedNodes.map((node) => ({
        project_id: parseInt(dataSource.dustAPIProjectId, 10),
        data_source_id: dataSource.dustAPIDataSourceId,
        table_id: node.node_id,
      })),
      query,
      conversationId: agentLoopRunContext.conversation.sId,
      fileName,
      connectorProvider,
    });
  },
};

export const TOOLS = buildTools(DATA_WAREHOUSES_TOOLS_METADATA, handlers);
