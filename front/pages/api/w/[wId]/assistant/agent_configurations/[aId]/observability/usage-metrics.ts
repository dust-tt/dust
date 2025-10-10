import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { formatUTCDateFromMillis, safeEsSearch } from "@app/lib/api/elasticsearch";

const QuerySchema = t.type({
  days: t.union([t.string, t.undefined]),
  interval: t.union([t.literal("day"), t.literal("week"), t.undefined]),
});

type ESBucket = {
  key: number; // millis since epoch
  doc_count: number; // messages count
  unique_conversations?: { value: number };
  active_users?: { value: number };
};

type ESResponse = {
  aggregations?: {
    by_interval?: { buckets: ESBucket[] };
  };
};

export type UsageMetricsPoint = {
  date: string; // YYYY-MM-DD (start of bucket)
  messages: number;
  conversations: number;
  activeUsers: number;
};

export type GetUsageMetricsResponse = {
  interval: "day" | "week";
  points: UsageMetricsPoint[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetUsageMetricsResponse>>,
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
      const interval =
        (q.right.interval as "day" | "week" | undefined) ?? "day";

      const owner = auth.getNonNullableWorkspace();

      const body = {
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { workspace_id: owner.sId } },
              { term: { agent_id: assistant.sId } },
              { range: { timestamp: { gte: `now-${days}d/d` } } },
            ],
          },
        },
        aggs: {
          by_interval: {
            date_histogram: {
              field: "timestamp",
              calendar_interval: interval,
            },
            aggs: {
              unique_conversations: {
                cardinality: { field: "conversation_id" },
              },
              active_users: { cardinality: { field: "user_id" } },
            },
          },
        },
      } as const;

      const json = await safeEsSearch<ESResponse>(req, res, body);
      if (!json) return;
      const buckets = json.aggregations?.by_interval?.buckets || [];

      const points: UsageMetricsPoint[] = buckets.map((b) => {
        const date = formatUTCDateFromMillis(b.key);
        return {
          date,
          messages: b.doc_count ?? 0,
          conversations: Math.round(b.unique_conversations?.value ?? 0),
          activeUsers: Math.round(b.active_users?.value ?? 0),
        };
      });

      return res.status(200).json({ interval, points });
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
