import type { estypes } from "@elastic/elasticsearch";
import { Client, errors as esErrors } from "@elastic/elasticsearch";

import config from "@app/lib/api/config";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

let esClient: Client | null = null;

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

function getClient(): Client {
  if (esClient) {
    return esClient;
  }
  const { url, username, password } = config.getElasticsearchConfig();
  esClient = new Client({
    node: url,
    auth: { username, password },
  });
  return esClient;
}

export type ElasticsearchError = {
  type: "connection_error" | "query_error" | "unknown_error";
  message: string;
  statusCode?: number;
};

type SearchParams = estypes.SearchRequest;

async function esSearch<TDocument = unknown, TAggregations = unknown>(
  params: SearchParams
): Promise<
  Result<estypes.SearchResponse<TDocument, TAggregations>, ElasticsearchError>
> {
  const client = getClient();
  try {
    const result = await client.search<TDocument, TAggregations>({
      ...params,
    });
    return new Ok(result);
  } catch (err) {
    if (err instanceof esErrors.ResponseError) {
      const statusCode = err.statusCode ?? undefined;
      const reason = extractErrorReason(err);
      return new Err({
        type: "query_error",
        message: reason,
        statusCode,
      });
    }
    if (err instanceof esErrors.ConnectionError) {
      return new Err({
        type: "connection_error",
        message: "Failed to connect to Elasticsearch",
      });
    }
    return new Err({
      type: "unknown_error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
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
 * High-level analytics-specific interface.
 * This interface enforces proper usage and makes it harder to accidentally
 * query other Elasticsearch indexes from the front service.
 */
export async function searchAnalytics<
  TDocument = unknown,
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
  const analyticsIndex = config.getElasticsearchConfig().analyticsIndex;
  return esSearch<TDocument, TAggregations>({
    index: analyticsIndex,
    query,
    aggs: options?.aggregations,
    size: options?.size,
    from: options?.from,
    sort: options?.sort,
  });
}
