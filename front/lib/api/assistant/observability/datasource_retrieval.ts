import type { estypes } from "@elastic/elasticsearch";

import {
  AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
  bucketsToArray,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DatasourceRetrievalData = {
  mcpServerConfigId: string;
  mcpServerName: string;
  count: number;
  datasources: {
    name: string;
    count: number;
  }[];
};

type TermBucket = {
  key: string;
  doc_count: number;
};

type DatasourceBucket = TermBucket;

type McpServerConfigBucket = TermBucket & {
  by_datasource?: estypes.AggregationsMultiBucketAggregateBase<DatasourceBucket>;
  by_mcp_server_name?: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
};

type DatasourceRetrievalAggs = {
  by_mcp_server_config?: estypes.AggregationsMultiBucketAggregateBase<McpServerConfigBucket>;
};

export async function fetchDatasourceRetrievalMetrics(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<DatasourceRetrievalData[], Error>> {
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
            field: "data_source_name",
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

  const data: DatasourceRetrievalData[] = mcpServerConfigBuckets.map(
    (mcpConfigBucket) => {
      const datasourceBuckets = bucketsToArray<DatasourceBucket>(
        mcpConfigBucket.by_datasource?.buckets
      );

      const mcpServerNameBuckets = bucketsToArray<TermBucket>(
        mcpConfigBucket.by_mcp_server_name?.buckets
      );

      return {
        mcpServerConfigId: mcpConfigBucket.key,
        mcpServerName:
          mcpServerNameBuckets.length > 0
            ? mcpServerNameBuckets[0].key
            : mcpConfigBucket.key,
        count: mcpConfigBucket.doc_count,
        datasources: datasourceBuckets.map((dsBucket) => ({
          name: dsBucket.key,
          count: dsBucket.doc_count,
        })),
      };
    }
  );

  return new Ok(data);
}
