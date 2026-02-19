import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import config from "@app/lib/api/config";
import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import {
  AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
  bucketsToArray,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationResource } from "@app/lib/resources/agent_mcp_server_configuration_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type { CoreAPIContentNode } from "@app/types/core/content_node";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type DatasourceRetrievalParentGroupData = {
  parentId: string | null;
  displayName: string;
  count: number;
};

export type DatasourceRetrievalDocumentData = {
  documentId: string;
  displayName: string;
  parentId: string | null;
  parents: string[];
  sourceUrl: string | null;
  count: number;
};

export type DatasourceRetrievalDocuments = {
  documents: DatasourceRetrievalDocumentData[];
  groups: DatasourceRetrievalParentGroupData[];
  total: number;
};

type DocumentBucket = {
  key: string;
  doc_count: number;
};

type DatasourceRetrievalDocumentsAggs = {
  by_document?: estypes.AggregationsMultiBucketAggregateBase<DocumentBucket>;
  total?: estypes.AggregationsValueCountAggregate;
};

const CORE_SEARCH_NODES_BATCH_SIZE = 200;

function chunkArray<T>(items: T[], batchSize: number): T[][] {
  if (items.length === 0 || batchSize <= 0) {
    return items.length === 0 ? [] : [items];
  }

  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function getNodeTitle(node: CoreAPIContentNode): string {
  if (node.title === UNTITLED_TITLE) {
    return node.node_id;
  }

  return node.title;
}

function isMeaningfulTitle(
  title: string | null,
  fallbackId: string
): title is string {
  return !!title && title !== UNTITLED_TITLE && title !== fallbackId;
}

async function fetchNodesById(
  coreAPI: CoreAPI,
  {
    dustDataSourceId,
    nodeIds,
  }: {
    dustDataSourceId: string;
    nodeIds: string[];
  }
): Promise<Map<string, CoreAPIContentNode>> {
  const nodesById = new Map<string, CoreAPIContentNode>();

  if (nodeIds.length === 0) {
    return nodesById;
  }

  const dataSourceViews = [
    {
      data_source_id: dustDataSourceId,
      view_filter: [],
    },
  ];

  const batches = chunkArray(nodeIds, CORE_SEARCH_NODES_BATCH_SIZE);
  for (const batch of batches) {
    const res = await coreAPI.searchNodes({
      filter: {
        data_source_views: dataSourceViews,
        node_ids: batch,
      },
      options: {
        limit: batch.length,
      },
    });

    if (res.isErr()) {
      continue;
    }

    for (const node of res.value.nodes) {
      nodesById.set(node.node_id, node);
    }
  }

  return nodesById;
}

export async function fetchDatasourceRetrievalDocumentsMetrics(
  auth: Authenticator,
  {
    agentId,
    days,
    version,
    mcpServerConfigIds,
    mcpServerName,
    dataSourceId,
    limit = 50,
  }: {
    agentId: string;
    days?: number;
    version?: string;
    mcpServerConfigIds: string[];
    // For servers without config IDs (like data_sources_file_system), use name instead.
    mcpServerName?: string;
    dataSourceId: string;
    limit?: number;
  }
): Promise<Result<DatasourceRetrievalDocuments, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  // Need at least one filter: either by config IDs or by server name.
  if (mcpServerConfigIds.length === 0 && !mcpServerName) {
    return new Ok({ documents: [], groups: [], total: 0 });
  }

  // Fetch configs by sId (only for servers with real config IDs).
  const mcpServerConfigs =
    mcpServerConfigIds.length > 0
      ? await AgentMCPServerConfigurationResource.fetchByIds(
          auth,
          mcpServerConfigIds
        )
      : [];

  const mcpServerConfigModelIds = mcpServerConfigs.map((config) => config.id);

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: workspace.sId,
    agentId,
    days,
    version,
  });

  // Build server filter: by config IDs OR by server name.
  const serverFilters: estypes.QueryDslQueryContainer[] = [];
  if (mcpServerConfigModelIds.length > 0) {
    serverFilters.push({
      terms: { mcp_server_configuration_id: mcpServerConfigModelIds },
    });
  }
  if (mcpServerName) {
    serverFilters.push({
      term: { mcp_server_name: mcpServerName },
    });
  }

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        baseQuery,
        {
          bool: {
            should: serverFilters,
            minimum_should_match: 1,
          },
        },
        {
          term: {
            data_source_id: dataSourceId,
          },
        },
      ],
    },
  };

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    total: {
      value_count: {
        field: "document_id",
      },
    },
    by_document: {
      terms: {
        field: "document_id",
        size: limit,
        order: { _count: "desc" },
      },
    },
  };

  const result = await withEs((client) =>
    client.search({
      index: AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
      query,
      aggs,
      size: 0,
    })
  );

  if (result.isErr()) {
    return new Err(
      new Error(
        `Failed to query datasource retrieval documents metrics: ${result.error.message}`
      )
    );
  }

  const response = result.value as estypes.SearchResponse<
    never,
    DatasourceRetrievalDocumentsAggs
  >;

  const documentBuckets = bucketsToArray<DocumentBucket>(
    response.aggregations?.by_document?.buckets
  );

  const documents: DatasourceRetrievalDocumentData[] = documentBuckets.map(
    (bucket) => ({
      documentId: bucket.key,
      displayName: bucket.key,
      parentId: null,
      parents: [bucket.key],
      sourceUrl: null,
      count: bucket.doc_count,
    })
  );

  const total = response.aggregations?.total?.value ?? 0;

  if (documents.length === 0) {
    return new Ok({ documents: [], groups: [], total });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);

  if (!dataSource) {
    return new Ok({ documents, groups: [], total });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const dustDataSourceId = dataSource.dustAPIDataSourceId;
  const documentIds = documents.map((document) => document.documentId);

  const documentNodesById = await fetchNodesById(coreAPI, {
    dustDataSourceId,
    nodeIds: documentIds,
  });

  const enrichedDocuments = documents.map((documentData) => {
    const node = documentNodesById.get(documentData.documentId);
    if (!node) {
      return documentData;
    }

    return {
      ...documentData,
      displayName: getNodeTitle(node),
      parentId: node.parent_id,
      parents: node.parents,
      sourceUrl: node.source_url ?? null,
    };
  });

  const countsByParentId = new Map<string | null, number>();
  for (const document of enrichedDocuments) {
    countsByParentId.set(
      document.parentId,
      (countsByParentId.get(document.parentId) ?? 0) + document.count
    );
  }

  const parentIds = Array.from(countsByParentId.keys()).filter(
    (parentId): parentId is string => parentId !== null
  );

  const parentDisplayNamesById = new Map<string, string>();
  for (const node of documentNodesById.values()) {
    const parentId = node.parent_id;
    if (parentId && isMeaningfulTitle(node.parent_title, parentId)) {
      parentDisplayNamesById.set(parentId, node.parent_title);
    }
  }

  const unresolvedParentIds = parentIds.filter(
    (parentId) => !parentDisplayNamesById.has(parentId)
  );

  if (unresolvedParentIds.length > 0) {
    const parentNodesById = await fetchNodesById(coreAPI, {
      dustDataSourceId,
      nodeIds: unresolvedParentIds,
    });

    for (const parentNode of parentNodesById.values()) {
      parentDisplayNamesById.set(parentNode.node_id, getNodeTitle(parentNode));
    }
  }

  const groups: DatasourceRetrievalParentGroupData[] = Array.from(
    countsByParentId.entries()
  )
    .map(([parentId, count]) => {
      if (parentId === null) {
        return { parentId, displayName: "Root", count };
      }

      return {
        parentId,
        displayName: parentDisplayNamesById.get(parentId) ?? parentId,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  return new Ok({ documents: enrichedDocuments, groups, total });
}
