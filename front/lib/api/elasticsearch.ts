import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export function getAnalyticsIndex(): string {
  return config.getElasticsearchConfig().analyticsIndex;
}

export async function esSearch<TResponse = unknown>(
  body: unknown,
  index?: string
): Promise<TResponse> {
  const { url, username, password } = config.getElasticsearchConfig();
  const idx = index ?? getAnalyticsIndex();

  const resp = await fetch(`${url}/${encodeURIComponent(idx)}/_search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
        "base64"
      )}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Elasticsearch query failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as TResponse;
}

export function formatUTCDateFromMillis(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function safeEsSearch<TResponse = unknown>(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<TResponse>>,
  body: unknown,
  index?: string
): Promise<TResponse | null> {
  try {
    return await esSearch<TResponse>(body, index);
  } catch (e: any) {
    apiError(req, res, {
      status_code: 502,
      api_error: {
        type: "elasticsearch_error",
        message: String(e?.message || e),
      },
    });
    return null;
  }
}
