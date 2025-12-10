import type { estypes } from "@elastic/elasticsearch";
import { Client, errors as esErrors } from "@elastic/elasticsearch";

import config from "@app/lib/api/config";
import { normalizeError } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

let esClient: Client | null = null;

export const ANALYTICS_ALIAS_NAME = "front.agent_message_analytics";
export const USER_SEARCH_ALIAS_NAME = "front.user_search";

/**
 * Mapping of index names to their directory locations.
 * This allows different features to organize their indices in feature-specific directories.
 */
export const INDEX_DIRECTORIES: Record<string, string> = {
  agent_message_analytics: "lib/analytics/indices",
  user_search: "lib/user_search/indices",
};

export interface ElasticsearchBaseDocument {
  workspace_id: string;

  [key: string]: unknown;
}

type ElasticSearchErrorType =
  | "connection_error"
  | "query_error"
  | "unknown_error";

export class ElasticsearchError extends Error {
  type: ElasticSearchErrorType;
  statusCode?: number;

  constructor(
    type: ElasticSearchErrorType,
    message: string,
    statusCode?: number
  ) {
    super(message);
    this.name = "ElasticsearchError";
    this.type = type;
    this.statusCode = statusCode;
  }
}

type SearchParams = estypes.SearchRequest;

function hasProp<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && key in obj;
}

function extractErrorReason(err: esErrors.ResponseError): string {
  const body = err.meta?.body;
  if (hasProp(body, "error") && typeof body.error === "object" && body.error) {
    const e = body.error as unknown;
    if (hasProp(e, "reason") && typeof e.reason !== "undefined") {
      return String(e.reason);
    }
  }
  return err.message;
}

function toElasticsearchError(err: unknown): ElasticsearchError {
  if (err instanceof esErrors.ResponseError) {
    const statusCode = err.statusCode ?? undefined;
    const reason = extractErrorReason(err);
    return new ElasticsearchError("query_error", reason, statusCode);
  }
  if (err instanceof esErrors.ConnectionError) {
    return new ElasticsearchError(
      "connection_error",
      "Failed to connect to Elasticsearch"
    );
  }
  return new ElasticsearchError("unknown_error", normalizeError(err).message);
}

export async function withEs<T>(
  fn: (client: Client) => Promise<T>
): Promise<Result<T, ElasticsearchError>> {
  const client = await getClient();
  try {
    const res = await fn(client);
    return new Ok(res);
  } catch (err) {
    return new Err(toElasticsearchError(err));
  }
}

export async function getClient(): Promise<Client> {
  if (esClient) {
    return esClient;
  }

  const { url, username, password } = config.getElasticsearchConfig();
  esClient = new Client({
    node: url,
    auth: { username, password },
    tls: { rejectUnauthorized: false },
  });

  // Wait for the client to be ready.
  await esClient.ping();

  return esClient;
}

async function esSearch<
  TDocument extends ElasticsearchBaseDocument,
  TAggregations = unknown,
>(
  params: SearchParams
): Promise<
  Result<estypes.SearchResponse<TDocument, TAggregations>, ElasticsearchError>
> {
  return withEs((client) =>
    client.search<TDocument, TAggregations>({
      ...params,
    })
  );
}

export function bucketsToArray<TBucket>(
  buckets?: estypes.AggregationsMultiBucketAggregateBase<TBucket>["buckets"]
): TBucket[] {
  if (!buckets) {
    return [];
  }
  return Array.isArray(buckets) ? buckets : Object.values(buckets);
}

export function formatUTCDateFromMillis(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Ensures at most N groups by keeping top N-1 groups and aggregating the rest into "Others".
 * If there are N groups or less, returns them as is. Otherwise aggregates the last ones
 * to make one single group.
 * The input must already be sorted by the desired criteria.
 *
 * @param groups - Array of groups with parsed points, already sorted by priority (e.g., by total cost)
 * @param max - Maximum number of groups to return (default: 5)
 * @param valueKey - Key of the numeric value to aggregate (e.g., "costMicroUsd")
 * @returns Array with at most N groups (top N-1 + optional "others" group)
 */
export function ensureAtMostNGroups<
  T extends { timestamp: number; [key: string]: number },
>(
  groups: Array<{ groupKey: string; points: T[] }>,
  max: number = 5,
  valueKey: keyof T
): Array<{ groupKey: string; points: T[] }> {
  if (groups.length <= max) {
    return groups;
  }
  // Keep top N-1 groups, last groups will be aggregated into "Others".
  const topGroups = groups.slice(0, max - 1);
  const otherGroups = groups.slice(max - 1);

  // If no groups beyond max, return as-is
  if (otherGroups.length === 0) {
    return topGroups;
  }

  // Aggregate all "other" groups into a single entry
  const aggregatedByTimestamp: Record<number, number> = {};

  // We have to compute the sum across all "other" groups for each timestamp. This
  // requires checking each point in all groups, leading to O(n^2) in the worst case,
  // but since typical numbers of groups and points are small, this is acceptable here.
  for (const { points } of otherGroups) {
    for (const point of points) {
      const value = point[valueKey] as number;
      aggregatedByTimestamp[point.timestamp] =
        (aggregatedByTimestamp[point.timestamp] || 0) + value;
    }
  }

  // Convert to sorted array matching the parsedPoints structure
  const aggregatedParsedPoints = Object.keys(aggregatedByTimestamp)
    .map(Number)
    .sort((a, b) => a - b)
    .map((timestamp) => ({
      timestamp,
      [valueKey]: aggregatedByTimestamp[timestamp],
    })) as T[];

  return [
    ...topGroups,
    {
      groupKey: "others",
      points: aggregatedParsedPoints,
    },
  ];
}

/**
 * High-level analytics-specific interface.
 * This interface enforces proper usage and makes it harder to accidentally
 * query other Elasticsearch indexes from the front service.
 */
export async function searchAnalytics<
  TDocument extends ElasticsearchBaseDocument | never,
  TAggregations = unknown,
>(
  query: estypes.QueryDslQueryContainer,
  options?: {
    aggregations?: Record<string, estypes.AggregationsAggregationContainer>;
    size?: number;
    from?: number;
    sort?: estypes.Sort;
  }
): Promise<
  Result<estypes.SearchResponse<TDocument, TAggregations>, ElasticsearchError>
> {
  return esSearch<TDocument, TAggregations>({
    index: ANALYTICS_ALIAS_NAME,
    query,
    aggs: options?.aggregations,
    size: options?.size,
    from: options?.from,
    sort: options?.sort,
  });
}
