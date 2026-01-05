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
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DatasourceRetrievalData = {
  mcpServerConfigId: string;
  mcpServerConfigName?: string;
  mcpServerName: string;
  count: number;
  datasources: {
    dataSourceId: string;
    displayName: string;
    count: number;
  }[];
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

type McpServerConfigBucket = TermBucket & {
  by_datasource?: estypes.AggregationsMultiBucketAggregateBase<DatasourceBucket>;
  by_mcp_server_name?: estypes.AggregationsMultiBucketAggregateBase<StringTermBucket>;
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

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_mcp_server_config: {
      terms: {
        field: "mcp_server_configuration_id",
        size: 20,
        order: { _count: "desc" },
      },
      aggs: {
        by_mcp_server_name: {
          terms: {
            field: "mcp_server_name",
            size: 1,
          },
        },
        by_datasource: {
          terms: {
            field: "data_source_id",
            size: 50,
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

  const configModelIds = Array.from(
    new Set(mcpServerConfigBuckets.map((b) => b.key))
  ).filter((id) => Number.isFinite(id) && id > 0);

  // Collect all unique data source IDs from all buckets.
  const allDataSourceIds = Array.from(
    new Set(
      mcpServerConfigBuckets.flatMap((bucket) =>
        bucketsToArray<DatasourceBucket>(bucket.by_datasource?.buckets).map(
          (ds) => ds.key
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

  const data: DatasourceRetrievalData[] = mcpServerConfigBuckets.map(
    (mcpConfigBucket) => {
      const datasourceBuckets = bucketsToArray<DatasourceBucket>(
        mcpConfigBucket.by_datasource?.buckets
      );

      const mcpServerNameBuckets = bucketsToArray<StringTermBucket>(
        mcpConfigBucket.by_mcp_server_name?.buckets
      );

      const config = serverConfigByModelId.get(mcpConfigBucket.key);
      const mcpServerName = mcpServerNameBuckets[0]?.key ?? "unknown";

      return {
        mcpServerConfigId: config?.sId ?? "unknown",
        mcpServerConfigName: config?.name ?? undefined,
        mcpServerName,
        count: mcpConfigBucket.doc_count,
        datasources: datasourceBuckets.map((dsBucket) => {
          const dataSource = dataSourceBySId.get(dsBucket.key);
          return {
            dataSourceId: dsBucket.key,
            displayName: dataSource
              ? getDisplayNameForDataSource(dataSource.toJSON())
              : dsBucket.key,
            count: dsBucket.doc_count,
          };
        }),
      };
    }
  );

  return new Ok(data);
}
