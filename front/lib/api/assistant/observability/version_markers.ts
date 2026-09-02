import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  buildConsumptionScopeQuery,
  COMPLETED_AT_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

const MAX_VERSIONS_TO_FETCH = 100;
const DEFAULT_TIMESTAMP_MS = 0;

export type AgentVersionMarker = {
  version: string;
  timestamp: number;
};

type VersionBucket = {
  key: string;
  doc_count: number;
  first_seen?: estypes.AggregationsMinAggregate;
};

type VersionMarkersAggs = {
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
};

export async function fetchVersionMarkers({
  auth,
  agentId,
  days,
}: {
  auth: Authenticator;
  agentId: string;
  days: number;
}): Promise<Result<AgentVersionMarker[], Error>> {
  const period = await resolveConsumptionPeriod(auth, { kind: "days", days });

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter: { agents: [agentId] },
  });

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_version: {
      terms: {
        field: "agent.version",
        size: MAX_VERSIONS_TO_FETCH,
      },
      aggs: {
        first_seen: {
          min: { field: COMPLETED_AT_FIELD },
        },
      },
    },
  };

  const result = await searchConsumptionAnalytics<never, VersionMarkersAggs>(
    query,
    {
      aggregations: aggs,
      size: 0,
    }
  );

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
      const timestamp =
        typeof firstSeenValue === "number"
          ? firstSeenValue
          : typeof firstSeenString === "string"
            ? parseInt(firstSeenString, 10)
            : DEFAULT_TIMESTAMP_MS;

      return {
        version: b.key,
        timestamp,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  return new Ok(versionMarkers);
}

export type GetVersionMarkersResponse = {
  versionMarkers: AgentVersionMarker[];
};
