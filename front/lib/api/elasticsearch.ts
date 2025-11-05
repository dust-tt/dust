import type { estypes } from "@elastic/elasticsearch";
import { Client, errors as esErrors } from "@elastic/elasticsearch";

import config from "@app/lib/api/config";
import { normalizeError } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

let esClient: Client | null = null;

export const ANALYTICS_ALIAS_NAME = "front.agent_message_analytics";

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
  let h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${y}-${m}-${day}, ${h}:${min}${ampm}`;
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
