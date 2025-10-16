import type { estypes } from "@elastic/elasticsearch";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const DEFAULT_PERIOD = 30;

const QuerySchema = t.type({
  days: t.union([t.string, t.undefined]),
  interval: t.union([t.literal("day"), t.literal("week"), t.undefined]),
});

type ByIntervalBucket = {
  key: number;
  doc_count: number;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  active_users?: estypes.AggregationsCardinalityAggregate;
};

type VersionBucket = {
  key: string;
  doc_count: number;
  first_seen?: estypes.AggregationsMinAggregate;
};

type UsageAggs = {
  by_interval?: estypes.AggregationsMultiBucketAggregateBase<ByIntervalBucket>;
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
};

export type UsageMetricsPoint = {
  date: string;
  messages: number;
  conversations: number;
  activeUsers: number;
};

export type AgentVersionMarker = {
  version: string;
  timestamp: string;
};

export type GetUsageMetricsResponse = {
  interval: "day" | "week";
  points: UsageMetricsPoint[];
  versionMarkers: AgentVersionMarker[];
};

function buildAgentAnalyticsBaseQuery(
  workspaceId: string,
  agentId: string,
  days: number
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { agent_id: agentId } },
        { range: { timestamp: { gte: `now-${days}d/d` } } },
      ],
    },
  };
}

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

      let days = DEFAULT_PERIOD;
      if (q.right.days) {
        const parsedDays = parseInt(q.right.days, 10);
        if (isNaN(parsedDays) || parsedDays <= 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Parameter 'days' must be a positive number",
            },
          });
        }
        days = parsedDays;
      }
      const interval = q.right.interval ?? "day";

      const owner = auth.getNonNullableWorkspace();

      const qdsl = buildAgentAnalyticsBaseQuery(owner.sId, assistant.sId, days);

      const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
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
        by_version: {
          terms: {
            field: "agent_version",
            size: 100,
          },
          aggs: {
            first_seen: {
              min: { field: "timestamp" },
            },
          },
        },
      };

      const result = await searchAnalytics<unknown, UsageAggs>(qdsl, {
        aggregations: aggs,
        size: 0,
      });
      if (result.isErr()) {
        const e = result.error;
        const statusCode =
          e.type === "connection_error" ? 503 : e.statusCode ?? 500;
        return apiError(req, res, {
          status_code: statusCode,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve usage metrics: ${e.message}`,
          },
        });
      }
      const json = result.value;
      const buckets = bucketsToArray<ByIntervalBucket>(
        json.aggregations?.by_interval?.buckets
      );

      const points: UsageMetricsPoint[] = buckets.map((b) => {
        const date = formatUTCDateFromMillis(b.key);
        return {
          date,
          messages: b.doc_count ?? 0,
          conversations: Math.round(b.unique_conversations?.value ?? 0),
          activeUsers: Math.round(b.active_users?.value ?? 0),
        };
      });

      const versionBuckets = bucketsToArray<VersionBucket>(
        json.aggregations?.by_version?.buckets
      );

      const versionMarkers: AgentVersionMarker[] = versionBuckets
        .map((b) => {
          const firstSeenValue = b.first_seen?.value;
          const firstSeenString = b.first_seen?.value_as_string;
          const timestampMs =
            typeof firstSeenValue === "number"
              ? firstSeenValue
              : typeof firstSeenString === "string"
                ? parseInt(firstSeenString, 10)
                : 0;

          return {
            version: b.key,
            timestamp: formatUTCDateFromMillis(timestampMs),
          };
        })
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

      return res.status(200).json({ interval, points, versionMarkers });
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
