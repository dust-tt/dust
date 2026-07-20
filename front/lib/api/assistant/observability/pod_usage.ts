import {
  bucketsToArray,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

// Messages whose conversation is not attached to a space are bucketed under
// this sentinel by the terms aggregation (missing field).
const MISSING_SPACE_ID = "__none__";

// Cardinality guard: a workspace is not expected to have anywhere near this
// many pods with activity on a single agent over the selected window.
const MAX_POD_BUCKETS = 100;

export type PodUsageBucket = {
  // Pod (project space) sId, or null for messages outside of any pod.
  podId: string | null;
  // Pod name, null for the no-pod bucket.
  name: string | null;
  count: number;
};

type PodUsageAggs = {
  by_space?: estypes.AggregationsMultiBucketAggregateBase<{
    key: string;
    doc_count: number;
  }>;
};

/**
 * Break down message counts by pod (project space). The analytics documents
 * store the sId of the space the conversation lives in; buckets pointing to
 * non-project spaces, deleted spaces or no space at all are merged into a
 * single null-pod bucket.
 */
export async function fetchPodUsageBreakdown(
  auth: Authenticator,
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<PodUsageBucket[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_space: {
      terms: {
        field: "space_id",
        size: MAX_POD_BUCKETS,
        missing: MISSING_SPACE_ID,
      },
    },
  };

  const result = await searchAnalytics<never, PodUsageAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const rawBuckets = bucketsToArray<{
    key: string;
    doc_count: number;
  }>(result.value.aggregations?.by_space?.buckets);

  const spaceIds = rawBuckets
    .map((b) => String(b.key))
    .filter((key) => key !== MISSING_SPACE_ID);

  // Include deleted spaces so historical messages stay attributed to the pod
  // they were sent in instead of silently moving to the no-pod bucket.
  const spaces = await SpaceResource.fetchByIds(auth, spaceIds, {
    includeDeleted: true,
  });
  const spacesById = new Map(spaces.map((space) => [space.sId, space]));

  const podBuckets: PodUsageBucket[] = [];
  let noPodCount = 0;

  for (const bucket of rawBuckets) {
    const key = String(bucket.key);
    const count = bucket.doc_count ?? 0;
    const space = key === MISSING_SPACE_ID ? undefined : spacesById.get(key);
    if (space && space.isProject()) {
      podBuckets.push({ podId: space.sId, name: space.name, count });
    } else {
      noPodCount += count;
    }
  }

  podBuckets.sort((a, b) => b.count - a.count);
  if (noPodCount > 0) {
    podBuckets.push({ podId: null, name: null, count: noPodCount });
  }

  return new Ok(podBuckets);
}

export type GetPodUsageResponse = {
  total: number;
  buckets: PodUsageBucket[];
};
