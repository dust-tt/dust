import type { estypes } from "@elastic/elasticsearch";

import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import {
  AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
  bucketsToArray,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { AgentMCPServerConfigurationResource } from "@app/lib/resources/agent_mcp_server_configuration_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { ConnectorProvider } from "@app/types";
import { asDisplayName } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const CONVERSATION_FILES_AGGREGATE_KEY = "__conversation_files__";
const CONVERSATION_FILES_DISPLAY_NAME = "Conversation Files";

export type DatasourceRetrievalData = {
  mcpServerConfigIds: string[];
  mcpServerDisplayName: string;
  mcpServerName: string;
  count: number;
  datasources: {
    dataSourceId: string;
    displayName: string;
    count: number;
    connectorProvider?: ConnectorProvider;
  }[];
};

type DatasourceAggregation = {
  dataSourceId: string;
  displayName: string;
  count: number;
  connectorProvider?: ConnectorProvider;
};

function resolveDatasourceDisplayName(
  dataSourceId: string,
  dataSource: DataSourceResource | undefined,
  isConversationDs: boolean
): string {
  if (isConversationDs) {
    return CONVERSATION_FILES_DISPLAY_NAME;
  }
  if (dataSource) {
    return getDisplayNameForDataSource(dataSource.toJSON());
  }
  return dataSourceId;
}

function aggregateDatasourceBuckets({
  target,
  buckets,
  conversationDataSourceIds,
  dataSourceBySId,
}: {
  target: Map<string, DatasourceAggregation>;
  buckets: DatasourceBucket[];
  conversationDataSourceIds: Set<string>;
  dataSourceBySId: Map<string, DataSourceResource>;
}): void {
  for (const bucket of buckets) {
    const isConversationDs = conversationDataSourceIds.has(bucket.key);
    const key = isConversationDs
      ? CONVERSATION_FILES_AGGREGATE_KEY
      : bucket.key;

    const existing = target.get(key);
    if (existing) {
      existing.count += bucket.doc_count;
    } else {
      const dataSource = dataSourceBySId.get(bucket.key);
      target.set(key, {
        dataSourceId: key,
        displayName: resolveDatasourceDisplayName(
          bucket.key,
          dataSource,
          isConversationDs
        ),
        count: bucket.doc_count,
        connectorProvider: dataSource?.connectorProvider ?? undefined,
      });
    }
  }
}

type ToolAggregation = {
  mcpServerConfigIds: Set<string>;
  mcpServerDisplayName: string;
  mcpServerName: string;
  count: number;
  datasources: Map<string, DatasourceAggregation>;
};

type TermBucket = {
  key: number;
  doc_count: number;
};

type StringTermBucket = {
  key: string;
  doc_count: number;
};

type DatasourceBucket = StringTermBucket;

// Aggregation bucket for mcp_server_name with nested datasources.
type ServerNameBucket = StringTermBucket & {
  by_datasource?: estypes.AggregationsMultiBucketAggregateBase<DatasourceBucket>;
};

// Aggregation bucket for mcp_server_configuration_id with nested server name.
type McpServerConfigBucket = TermBucket & {
  by_mcp_server_name?: estypes.AggregationsMultiBucketAggregateBase<ServerNameBucket>;
};

type DatasourceRetrievalAggs = {
  by_mcp_server_config?: estypes.AggregationsMultiBucketAggregateBase<McpServerConfigBucket>;
};

export async function fetchDatasourceRetrievalMetrics(
  auth: Authenticator,
  {
    agentId,
    days,
    version,
  }: {
    agentId: string;
    days?: number;
    version?: string;
  }
): Promise<Result<DatasourceRetrievalData[], Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: workspace.sId,
    agentId,
    days,
    version,
  });

  // Aggregate by mcp_server_configuration_id (primary), with missing=0 to capture
  // servers without config IDs (like data_sources_file_system).
  // Datasource aggregation is nested under server name so each server gets its own breakdown.
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_mcp_server_config: {
      terms: {
        field: "mcp_server_configuration_id",
        size: 50,
        order: { _count: "desc" },
        missing: 0, // Capture documents without config ID in bucket with key=0
      },
      aggs: {
        by_mcp_server_name: {
          terms: {
            field: "mcp_server_name",
            size: 10, // Allow multiple server names in the missing bucket
          },
          aggs: {
            by_datasource: {
              terms: {
                field: "data_source_id",
                size: 50,
              },
            },
          },
        },
      },
    },
  };

  const result = await withEs((client) =>
    client.search({
      index: AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
      query: baseQuery,
      aggs,
      size: 0,
    })
  );

  if (result.isErr()) {
    return new Err(
      new Error(
        `Failed to query datasource retrieval metrics: ${result.error.message}`
      )
    );
  }

  const response = result.value as estypes.SearchResponse<
    never,
    DatasourceRetrievalAggs
  >;
  const mcpServerConfigBuckets = bucketsToArray<McpServerConfigBucket>(
    response.aggregations?.by_mcp_server_config?.buckets
  );

  // Collect all config model IDs (excluding 0 which represents missing).
  const configModelIds = mcpServerConfigBuckets
    .map((b) => b.key)
    .filter((id) => Number.isFinite(id) && id > 0);

  // Collect all unique data source IDs from all buckets (nested under server names).
  const allDataSourceIds = Array.from(
    new Set(
      mcpServerConfigBuckets.flatMap((configBucket) =>
        bucketsToArray<ServerNameBucket>(
          configBucket.by_mcp_server_name?.buckets
        ).flatMap((serverNameBucket) =>
          bucketsToArray<DatasourceBucket>(
            serverNameBucket.by_datasource?.buckets
          ).map((ds) => ds.key)
        )
      )
    )
  );

  const serverConfigs =
    configModelIds.length > 0
      ? await AgentMCPServerConfigurationResource.fetchByModelIds(
          auth,
          configModelIds
        )
      : [];

  const dataSources =
    allDataSourceIds.length > 0
      ? await DataSourceResource.fetchByIds(auth, allDataSourceIds)
      : [];

  const serverConfigByModelId = new Map(
    serverConfigs.map((cfg) => [cfg.id, cfg])
  );
  const dataSourceBySId = new Map(dataSources.map((ds) => [ds.sId, ds]));

  const conversationDataSourceIds = new Set(
    dataSources.filter((ds) => ds.conversationId !== null).map((ds) => ds.sId)
  );

  // Use composite key (displayName::serverName) to merge configs that share both.
  // This handles delete/recreate scenarios while keeping different server types separate.
  const groupedByCompositeKey = new Map<string, ToolAggregation>();

  function getOrCreateToolGroup({
    mcpServerDisplayName,
    mcpServerName,
  }: {
    mcpServerDisplayName: string;
    mcpServerName: string;
  }): ToolAggregation {
    const compositeKey = `${mcpServerDisplayName}::${mcpServerName}`;
    const existing = groupedByCompositeKey.get(compositeKey);
    if (existing) {
      return existing;
    }

    const group: ToolAggregation = {
      mcpServerConfigIds: new Set<string>(),
      mcpServerDisplayName,
      mcpServerName,
      count: 0,
      datasources: new Map(),
    };
    groupedByCompositeKey.set(compositeKey, group);
    return group;
  }

  function addDatasourcesToGroup(
    group: ToolAggregation,
    datasourceBuckets: DatasourceBucket[]
  ) {
    aggregateDatasourceBuckets({
      target: group.datasources,
      buckets: datasourceBuckets,
      conversationDataSourceIds,
      dataSourceBySId,
    });
  }

  for (const configBucket of mcpServerConfigBuckets) {
    const configModelId = configBucket.key;
    const serverNameBuckets = bucketsToArray<ServerNameBucket>(
      configBucket.by_mcp_server_name?.buckets
    );

    if (configModelId === 0) {
      // Handle servers without config IDs (like data_sources_file_system).
      // Create separate entries per server name within this bucket.
      // Each server name now has its own datasource breakdown.
      for (const serverNameBucket of serverNameBuckets) {
        const mcpServerName = serverNameBucket.key;
        const mcpServerDisplayName = asDisplayName(mcpServerName);
        const datasourceBuckets = bucketsToArray<DatasourceBucket>(
          serverNameBucket.by_datasource?.buckets
        );

        const group = getOrCreateToolGroup({
          mcpServerDisplayName,
          mcpServerName,
        });

        group.count += serverNameBucket.doc_count;
        addDatasourcesToGroup(group, datasourceBuckets);
      }
    } else {
      // Handle servers with config IDs - each config is a separate entry
      // (merged only if they share the same display name AND server name).
      const config = serverConfigByModelId.get(configModelId);
      const mcpServerName = serverNameBuckets[0]?.key ?? "unknown";
      const mcpServerDisplayName =
        asDisplayName(config?.name) || asDisplayName(mcpServerName);
      const datasourceBuckets = bucketsToArray<DatasourceBucket>(
        serverNameBuckets[0]?.by_datasource?.buckets
      );

      const group = getOrCreateToolGroup({
        mcpServerDisplayName,
        mcpServerName,
      });

      if (config) {
        group.mcpServerConfigIds.add(config.sId);
      }

      group.count += configBucket.doc_count;
      addDatasourcesToGroup(group, datasourceBuckets);
    }
  }

  const data: DatasourceRetrievalData[] = Array.from(
    groupedByCompositeKey.values()
  )
    .map((group) => ({
      mcpServerConfigIds: Array.from(group.mcpServerConfigIds).sort(),
      mcpServerDisplayName: group.mcpServerDisplayName,
      mcpServerName: group.mcpServerName,
      count: group.count,
      datasources: Array.from(group.datasources.values()).sort(
        (a, b) => b.count - a.count
      ),
    }))
    .sort((a, b) => b.count - a.count);

  return new Ok(data);
}

export type WorkspaceDatasourceRetrievalData = {
  dataSourceId: string;
  displayName: string;
  count: number;
  connectorProvider?: ConnectorProvider;
};

type WorkspaceDatasourceRetrievalAggs = {
  by_datasource?: estypes.AggregationsMultiBucketAggregateBase<DatasourceBucket>;
};

export async function fetchWorkspaceDatasourceRetrievalMetrics(
  auth: Authenticator,
  { days }: { days?: number }
): Promise<Result<WorkspaceDatasourceRetrievalData[], Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: workspace.sId,
    days,
  });

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_datasource: {
      terms: {
        field: "data_source_id",
        size: 200,
        order: { _count: "desc" },
      },
    },
  };

  const result = await withEs((client) =>
    client.search({
      index: AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
      query: baseQuery,
      aggs,
      size: 0,
    })
  );

  if (result.isErr()) {
    return new Err(
      new Error(
        `Failed to query workspace datasource retrieval metrics: ${result.error.message}`
      )
    );
  }

  const response = result.value as estypes.SearchResponse<
    never,
    WorkspaceDatasourceRetrievalAggs
  >;
  const datasourceBuckets = bucketsToArray<DatasourceBucket>(
    response.aggregations?.by_datasource?.buckets
  );

  const dataSourceIds = datasourceBuckets.map((b) => b.key);
  const dataSources =
    dataSourceIds.length > 0
      ? await DataSourceResource.fetchByIds(auth, dataSourceIds)
      : [];

  const dataSourceBySId = new Map(dataSources.map((ds) => [ds.sId, ds]));

  const conversationDataSourceIds = new Set(
    dataSources.filter((ds) => ds.conversationId !== null).map((ds) => ds.sId)
  );

  const resultMap = new Map<string, DatasourceAggregation>();

  aggregateDatasourceBuckets({
    target: resultMap,
    buckets: datasourceBuckets,
    conversationDataSourceIds,
    dataSourceBySId,
  });

  const data: WorkspaceDatasourceRetrievalData[] = Array.from(
    resultMap.values()
  );

  return new Ok(data);
}
