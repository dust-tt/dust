import type { estypes } from "@elastic/elasticsearch";
import { Client, errors as esErrors } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export function getAnalyticsIndex(): string {
  return config.getElasticsearchConfig().analyticsIndex;
}

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

export type SearchParams = estypes.SearchRequest;

export async function esSearch<TDocument = unknown, TAggregations = unknown>(
  params: SearchParams
): Promise<estypes.SearchResponse<TDocument, TAggregations>> {
  const client = getClient();
  try {
    return await client.search<TDocument, TAggregations>({
      ...params,
    });
  } catch (err) {
    if (err instanceof esErrors.ResponseError) {
      const status = err.statusCode ?? "unknown";
      const reason = extractErrorReason(err);
      throw new Error(`Elasticsearch query failed (${status}): ${reason}`);
    }
    throw err;
  }
}

export async function safeEsSearch<
  TDocument = unknown,
  TAggregations = unknown,
>(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<any>>,
  params: SearchParams
): Promise<estypes.SearchResponse<TDocument, TAggregations> | null> {
  try {
    return await esSearch<TDocument, TAggregations>(params);
  } catch (err) {
    apiError(req, res, {
      status_code: 502,
      api_error: {
        type: "elasticsearch_error",
        message: String(err),
      },
    });
    return null;
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
