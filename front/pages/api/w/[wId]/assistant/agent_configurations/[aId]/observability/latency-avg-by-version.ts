import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { formatUTCDateFromMillis, safeEsSearch } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = t.type({
  days: t.union([t.string, t.undefined]),
  tool: t.string,
});

type ESBucket = {
  key: number;
  versions?: {
    buckets: { key: string; avg_latency?: { value: number | null } }[];
  };
};

type ESResponse = {
  aggregations?: {
    by_day?: { buckets: ESBucket[] };
  };
};

export type LatencyAvgPoint = {
  date: string;
  versions: Record<string, number | null>;
};

export type GetLatencyAvgByVersionResponse = {
  points: LatencyAvgPoint[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetLatencyAvgByVersionResponse>
  >,
  auth: Authenticator
) {
  const assistant = await getAgentConfiguration(auth, {
    agentId: req.query.aId as string,
    variant: "light",
  });

  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  if (!assistant.canEdit && !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can get agent observability.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const q = QuerySchema.decode(req.query);
      if (isLeft(q)) {
        const msg = reporter.formatValidationErrors(q.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${msg}`,
          },
        });
      }

      const days = q.right.days ? parseInt(q.right.days as string, 10) : 30;
      const tool = q.right.tool as string;

      const owner = auth.getNonNullableWorkspace();
      const assistantSId = assistant.sId;

      const body = {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { workspace_id: owner.sId } },
              { term: { agent_id: assistantSId } },
              { range: { timestamp: { gte: `now-${days}d/d` } } },
              { exists: { field: "latency_ms" } },
              {
                nested: {
                  path: "tools_used",
                  query: {
                    bool: {
                      filter: [
                        { term: { "tools_used.tool_name": tool } },
                        { term: { "tools_used.status": "succeeded" } },
                      ],
                    },
                  },
                  score_mode: "none",
                },
              },
            ],
          },
        },
        aggs: {
          by_day: {
            date_histogram: { field: "timestamp", calendar_interval: "day" },
            aggs: {
              versions: {
                terms: { field: "agent_version", size: 50 },
                aggs: { avg_latency: { avg: { field: "latency_ms" } } },
              },
            },
          },
        },
      } as const;

      const json = await safeEsSearch<ESResponse>(req, res, body);
      if (!json) {return;}
      const buckets = json.aggregations?.by_day?.buckets ?? [];

      const points: LatencyAvgPoint[] = buckets.map((b) => {
        const date = formatUTCDateFromMillis(b.key);
        const vBuckets = b.versions?.buckets ?? [];
        const versions: Record<string, number | null> = {};
        for (const vb of vBuckets) {
          versions[vb.key] = vb.avg_latency?.value ?? null;
        }
        return { date, versions };
      });

      return res.status(200).json({ points });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
