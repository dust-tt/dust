import type { estypes } from "@elastic/elasticsearch";

import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_VERSIONS_TO_FETCH = 100;
const DEFAULT_TIMESTAMP_MS = 0;

export type AgentVersionMarker = {
  version: string;
  timestamp: string;
};

type VersionBucket = {
  key: string;
  doc_count: number;
  first_seen?: estypes.AggregationsMinAggregate;
};

type VersionMarkersAggs = {
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
};

export async function fetchVersionMarkers(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AgentVersionMarker[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_version: {
      terms: {
        field: "agent_version",
        size: MAX_VERSIONS_TO_FETCH,
      },
      aggs: {
        first_seen: {
          min: { field: "timestamp" },
        },
      },
    },
  };

  const result = await searchAnalytics<unknown, VersionMarkersAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const versionBuckets = bucketsToArray<VersionBucket>(
    result.value.aggregations?.by_version?.buckets
  );

  const versionMarkers: AgentVersionMarker[] = versionBuckets
    .map((b) => {
      const firstSeenValue = b.first_seen?.value;
      const firstSeenString = b.first_seen?.value_as_string;
      const timestampMs =
        typeof firstSeenValue === "number"
          ? firstSeenValue
          : typeof firstSeenString === "string"
            ? parseInt(firstSeenString, 10)
            : DEFAULT_TIMESTAMP_MS;

      return {
        version: b.key,
        timestamp: formatUTCDateFromMillis(timestampMs),
      };
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  return new Ok(versionMarkers);
}
