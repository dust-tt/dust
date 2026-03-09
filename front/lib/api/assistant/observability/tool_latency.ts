import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

const DEFAULT_METRIC_VALUE = 0;

export type ToolLatencyByVersion = {
  version: string;
  tools: {
    [toolName: string]: {
      count: number;
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
    };
  };
};

export type ToolLatencyView = "server" | "tool";

export type ToolLatencyRow = {
  name: string;
  count: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
};

type TermBucket = {
  key: string;
  doc_count: number;
};

// We request keyed percentiles below; reflect that in type so indexing is safe.
type KeyedTDigestPercentiles = Omit<
  estypes.AggregationsTDigestPercentilesAggregate,
  "values"
> & {
  values: Record<string, number | null>;
};

type ToolBucket = TermBucket & {
  avg_latency?: estypes.AggregationsAvgAggregate;
  percentiles?: KeyedTDigestPercentiles;
};

type VersionBucket = TermBucket & {
  tools?: {
    succeeded?: {
      tool_names?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
    };
  };
  first_seen?: estypes.AggregationsMinAggregate;
};

type ToolLatencyAggs = {
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
};

type ToolLatencyByNameAggs = {
  tools?: {
    succeeded?: {
      by_name?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
    };
  };
};

function buildLatencyRows(
  buckets?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>
): ToolLatencyRow[] {
  const toolBuckets = bucketsToArray<ToolBucket>(buckets?.buckets);

  return toolBuckets.map((tb) => {
    const count = tb.doc_count || DEFAULT_METRIC_VALUE;
    const avgLatencyMs = Math.round(
      tb.avg_latency?.value ?? DEFAULT_METRIC_VALUE
    );
    const p50LatencyMs = Math.round(
      tb.percentiles?.values?.["50.0"] ?? DEFAULT_METRIC_VALUE
    );
    const p95LatencyMs = Math.round(
      tb.percentiles?.values?.["95.0"] ?? DEFAULT_METRIC_VALUE
    );

    return {
      name: tb.key,
      count,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
    };
  });
}

export async function fetchToolLatencyMetricsByName(
  baseQuery: estypes.QueryDslQueryContainer,
  { view, serverName }: { view: ToolLatencyView; serverName?: string }
): Promise<Result<ToolLatencyRow[], Error>> {
  if (view === "tool" && !serverName) {
    return new Err(new Error("Missing server name for tool latency view."));
  }

  const nameField =
    view === "server" ? "tools_used.server_name" : "tools_used.tool_name";

  const nestedFilter: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { "tools_used.status": "succeeded" } },
        ...(view === "tool"
          ? [{ term: { "tools_used.server_name": serverName } }]
          : []),
      ],
    },
  };

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    tools: {
      nested: { path: "tools_used" },
      aggs: {
        succeeded: {
          filter: nestedFilter,
          aggs: {
            by_name: {
              terms: {
                field: nameField,
                size: 50,
                order: { _count: "desc" },
              },
              aggs: {
                avg_latency: {
                  avg: { field: "tools_used.execution_time_ms" },
                },
                percentiles: {
                  percentiles: {
                    field: "tools_used.execution_time_ms",
                    percents: [50, 95],
                    keyed: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, ToolLatencyByNameAggs>(
    baseQuery,
    {
      aggregations: aggs,
      size: 0,
    }
  );

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const rows = buildLatencyRows(
    result.value.aggregations?.tools?.succeeded?.by_name
  );

  return new Ok(rows);
}

export async function fetchToolLatencyMetrics(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ToolLatencyByVersion[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_version: {
      terms: {
        field: "agent_version",
        size: 100,
        order: { first_seen: "asc" },
      },
      aggs: {
        first_seen: {
          min: { field: "timestamp" },
        },
        tools: {
          nested: { path: "tools_used" },
          aggs: {
            succeeded: {
              filter: { term: { "tools_used.status": "succeeded" } },
              aggs: {
                tool_names: {
                  terms: {
                    field: "tools_used.tool_name",
                    size: 50,
                  },
                  aggs: {
                    avg_latency: {
                      avg: { field: "tools_used.execution_time_ms" },
                    },
                    percentiles: {
                      percentiles: {
                        field: "tools_used.execution_time_ms",
                        percents: [50, 95],
                        keyed: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, ToolLatencyAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const versionBuckets = bucketsToArray<VersionBucket>(
    result.value.aggregations?.by_version?.buckets
  );

  const byVersion: ToolLatencyByVersion[] = versionBuckets.map((vb) => {
    const toolBuckets = bucketsToArray<ToolBucket>(
      vb.tools?.succeeded?.tool_names?.buckets
    );

    const tools: ToolLatencyByVersion["tools"] = {};

    toolBuckets.forEach((tb) => {
      const count = tb.doc_count || DEFAULT_METRIC_VALUE;
      const avgLatencyMs = Math.round(
        tb.avg_latency?.value ?? DEFAULT_METRIC_VALUE
      );
      const p50LatencyMs = Math.round(
        tb.percentiles?.values?.["50.0"] ?? DEFAULT_METRIC_VALUE
      );
      const p95LatencyMs = Math.round(
        tb.percentiles?.values?.["95.0"] ?? DEFAULT_METRIC_VALUE
      );

      tools[tb.key] = {
        count,
        avgLatencyMs,
        p50LatencyMs,
        p95LatencyMs,
      };
    });

    return {
      version: vb.key,
      tools,
    };
  });

  return new Ok(byVersion);
}
