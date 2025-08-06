import type { CoreAPIError, Result } from "@dust-tt/client";
import { Err, INTERNAL_MIME_TYPES, Ok } from "@dust-tt/client";
import _ from "lodash";

import type { RenderedWarehouseNodeType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ResolvedDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { makeDataSourceViewFilter } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type { CoreAPIContentNode } from "@app/types";
import { CoreAPI, DATA_SOURCE_NODE_ID } from "@app/types";

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
}) {
  return {
    mimeType: "application/vnd.dust.tool-output.tables-filesystem-browse",
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
  const dataSourceSId = dataSourceById[node.data_source_id]?.sId;
  const connectorProvider =
    dataSourceById[node.data_source_id]?.connectorProvider;

  const nodeId =
    node.node_id === DATA_SOURCE_NODE_ID
      ? `warehouse-${dataSourceSId}`
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
