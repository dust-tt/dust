import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import _ from "lodash";

import type {
  RenderedWarehouseNodeType,
  WarehousesBrowseType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { WAREHOUSES_BROWSE_MIME_TYPE } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ResolvedDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { makeDataSourceViewFilter } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type { CoreAPIContentNode, CoreAPIError, Result } from "@app/types";
import { CoreAPI, DATA_SOURCE_NODE_ID, Err, Ok } from "@app/types";

export async function getAvailableWarehouses(
  auth: Authenticator,
  dataSourceConfigurations: ResolvedDataSourceConfiguration[],
  { limit, nextPageCursor }: { limit: number; nextPageCursor?: string }
): Promise<
  Result<
    { nodes: RenderedWarehouseNodeType[]; nextPageCursor: string | null },
    CoreAPIError
  >
> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const dataSourceViewFilter = makeDataSourceViewFilter(
    dataSourceConfigurations
  ).map((view) => ({
    ...view,
    search_scope: "data_source_name" as const,
  }));
  const searchResult = await coreAPI.searchNodes({
    filter: {
      data_source_views: dataSourceViewFilter,
    },
    options: {
      cursor: nextPageCursor,
      limit,
      sort: [{ field: "timestamp", direction: "desc" as const }],
    },
  });
  if (searchResult.isErr()) {
    return searchResult;
  }

  const dataSourceById = _.keyBy(
    await DataSourceResource.fetchByDustAPIDataSourceIds(
      auth,
      searchResult.value.nodes.map((node) => node.data_source_id)
    ),
    "dustAPIDataSourceId"
  );

  const dataSourceNodes = searchResult.value.nodes.map((node) =>
    renderNode(node, dataSourceById)
  );

  return new Ok({
    nodes: dataSourceNodes,
    nextPageCursor: searchResult.value.next_page_cursor,
  });
}

export async function getWarehouseNodes(
  auth: Authenticator,
  dataSourceConfigurations: ResolvedDataSourceConfiguration[],
  {
    nodeId,
    query,
    limit,
    nextPageCursor,
  }: {
    nodeId: string | null;
    query?: string;
    limit: number;
    nextPageCursor?: string;
  }
): Promise<
  Result<
    { nodes: RenderedWarehouseNodeType[]; nextPageCursor: string | null },
    Error | CoreAPIError
  >
> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  let configsToUse: ResolvedDataSourceConfiguration[] =
    dataSourceConfigurations;
  let parentIdToUse: string | null = nodeId;
  let dataSourceById: Record<string, DataSourceResource | null> | null = null;

  if (nodeId && nodeId.startsWith("warehouse-")) {
    const dataSourceId = nodeId.substring("warehouse-".length);
    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return new Err(
        new Error(`Data source not found for ID: ${dataSourceId}`)
      );
    }
    const dataSourceConfiguration = dataSourceConfigurations.find(
      (ds) =>
        ds.dataSource.dustAPIDataSourceId === dataSource.dustAPIDataSourceId
    );
    if (!dataSourceConfiguration) {
      return new Err(
        new Error(`Data source configuration not found for ID: ${dataSourceId}`)
      );
    }
    configsToUse = [dataSourceConfiguration];
    parentIdToUse = "root";
    dataSourceById = {
      [dataSource.dustAPIDataSourceId]: dataSource,
    };
  }

  if (!dataSourceById) {
    dataSourceById = _.keyBy(
      await DataSourceResource.fetchByDustAPIDataSourceIds(
        auth,
        configsToUse.map((ds) => ds.dataSource.dustAPIDataSourceId)
      ),
      "dustAPIDataSourceId"
    );
  }

  const result = await coreAPI.searchNodes({
    query,
    filter: {
      data_source_views: makeDataSourceViewFilter(configsToUse),
      parent_id: parentIdToUse ?? undefined,
    },
    options: {
      cursor: nextPageCursor,
      limit,
      sort: query
        ? undefined
        : [{ field: "timestamp", direction: "desc" as const }],
    },
  });

  if (result.isErr()) {
    return result;
  }

  const nodes = result.value.nodes.map((node) => {
    return renderNode(node, dataSourceById);
  });

  return new Ok({
    nodes,
    nextPageCursor: result.value.next_page_cursor,
  });
}

export function makeBrowseResource({
  nodeId,
  nodes,
  nextPageCursor,
  resultCount,
}: {
  nodeId: string | null;
  nodes: RenderedWarehouseNodeType[];
  nextPageCursor: string | null;
  resultCount: number;
}): WarehousesBrowseType {
  return {
    mimeType: WAREHOUSES_BROWSE_MIME_TYPE,
    uri: "",
    text: `Showing ${nodes.length} results.${nextPageCursor ? " More results available." : " No more results available."}`,
    nodeId,
    data: nodes,
    nextPageCursor,
    resultCount,
  };
}

function renderNode(
  node: CoreAPIContentNode,
  dataSourceById: Record<string, DataSourceResource | null>
): RenderedWarehouseNodeType {
  const dataSourceId = dataSourceById[node.data_source_id]?.sId;
  const connectorProvider =
    dataSourceById[node.data_source_id]?.connectorProvider;

  const nodeId =
    node.node_id === DATA_SOURCE_NODE_ID
      ? `warehouse-${dataSourceId}`
      : node.node_id;

  const mimeType =
    node.node_id === DATA_SOURCE_NODE_ID
      ? INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE
      : node.mime_type;

  return {
    nodeId,
    title: node.title,
    path: node.parents.join("/"),
    parentTitle: node.parent_title,
    mimeType,
    hasChildren: node.children_count > 0,
    connectorProvider: connectorProvider ?? null,
  };
}

export async function validateTables(
  auth: Authenticator,
  tableIds: string[],
  dataSourceConfigurations: ResolvedDataSourceConfiguration[]
): Promise<
  Result<
    { validatedNodes: CoreAPIContentNode[]; dataSourceId: string },
    Error | CoreAPIError
  >
> {
  if (tableIds.length === 0) {
    return new Ok({ validatedNodes: [], dataSourceId: "" });
  }

  const parsedTables: { dataSourceId: string; nodeId: string }[] = [];
  const dataSourceIds = new Set<string>();

  for (const tableId of tableIds) {
    if (!tableId.startsWith("table-")) {
      return new Err(
        new Error(
          `Invalid table ID format: ${tableId}. Expected format: table-<dataSourceSId>-<nodeId>`
        )
      );
    }

    const parts = tableId.substring("table-".length).split("-");
    if (parts.length < 2) {
      return new Err(
        new Error(
          `Invalid table ID format: ${tableId}. Expected format: table-<dataSourceSId>-<nodeId>`
        )
      );
    }

    const dataSourceId = parts[0];
    const nodeId = parts.slice(1).join("-");

    parsedTables.push({ dataSourceId, nodeId });
    dataSourceIds.add(dataSourceId);
  }

  if (dataSourceIds.size > 1) {
    return new Err(
      new Error(
        `All tables must be from the same warehouse. Found tables from warehouses: ${Array.from(dataSourceIds).join(", ")}`
      )
    );
  }

  const dataSourceId = Array.from(dataSourceIds)[0];
  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
  if (!dataSource) {
    return new Err(new Error(`Data source not found for ID: ${dataSourceId}`));
  }

  const relevantConfig = dataSourceConfigurations.find(
    (config) =>
      config.dataSource.dustAPIDataSourceId === dataSource.dustAPIDataSourceId
  );

  if (!relevantConfig) {
    return new Err(
      new Error(
        `Tables from warehouse ${dataSourceId} are not accessible with the current view filter`
      )
    );
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchResult = await coreAPI.searchNodes({
    filter: {
      data_source_views: makeDataSourceViewFilter([relevantConfig]),
      node_ids: parsedTables.map((t) => t.nodeId),
    },
  });

  if (searchResult.isErr()) {
    return searchResult;
  }

  const foundNodeIds = new Set(searchResult.value.nodes.map((n) => n.node_id));
  const missingTables = parsedTables.filter((t) => !foundNodeIds.has(t.nodeId));

  if (missingTables.length > 0) {
    return new Err(
      new Error(
        `The following tables are not accessible with the current view filter: ${missingTables
          .map((t) => `table-${t.dataSourceId}-${t.nodeId}`)
          .join(", ")}`
      )
    );
  }

  return new Ok({
    validatedNodes: searchResult.value.nodes,
    dataSourceId,
  });
}
