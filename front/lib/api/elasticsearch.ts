import type { estypes } from "@elastic/elasticsearch";
import { Client, errors as esErrors } from "@elastic/elasticsearch";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { normalizeError } from "@app/types";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
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

async function withEs<T>(
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

/**
 * Append a feedback entry atomically to the `feedbacks` array.
 */
export async function appendFeedbackToAnalyticsDoc({
  auth,
  id,
  feedback,
}: {
  auth: Authenticator;
  id: string;
  feedback: AgentMessageAnalyticsFeedback;
}): Promise<Result<estypes.UpdateResponse, ElasticsearchError>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  return withEs(async (client) => {
    const getRes = await client.get<{
      workspace_id?: string;
      feedbacks?: AgentMessageAnalyticsFeedback[];
    }>({
      index: ANALYTICS_ALIAS_NAME,
      id,
      _source_includes: ["workspace_id", "feedbacks"],
    });

    if (getRes._source?.workspace_id !== workspaceId) {
      throw new Error(
        `Document ${id} does not belong to workspace ${workspaceId}`
      );
    }

    const seqNo = getRes._seq_no;
    const primaryTerm = getRes._primary_term;
    const currentFeedback = getRes._source?.feedbacks ?? [];

    const newFeedback = [...currentFeedback, feedback];

    return client.update({
      index: ANALYTICS_ALIAS_NAME,
      id,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      doc: { feedbacks: newFeedback },
      refresh: "wait_for",
    });
  });
}
