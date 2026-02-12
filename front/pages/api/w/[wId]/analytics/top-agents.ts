import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(100).optional().default(25),
});

export type WorkspaceTopAgentRow = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  messageCount: number;
  userCount: number;
};

export type GetWorkspaceTopAgentsResponse = {
  agents: WorkspaceTopAgentRow[];
};

type TopAgentsAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<{
    key: string;
    doc_count: number;
    unique_users?: estypes.AggregationsCardinalityAggregate;
  }>;
};

type TopAgentBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceTopAgentsResponse>>,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { days, limit } = req.query;
      const q = QuerySchema.safeParse({ days, limit });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days: q.data.days,
      });

      const result = await searchAnalytics<never, TopAgentsAggs>(
        {
          bool: {
            filter: [baseQuery, { exists: { field: "agent_id" } }],
          },
        },
        {
          aggregations: {
            by_agent: {
              terms: {
                field: "agent_id",
                size: q.data.limit,
              },
              aggs: {
                unique_users: {
                  cardinality: {
                    field: "user_id",
                  },
                },
              },
            },
          },
          size: 0,
        }
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve top agents: ${fromError(result.error).toString()}`,
          },
        });
      }

      const buckets = bucketsToArray<TopAgentBucket>(
        result.value.aggregations?.by_agent?.buckets
      );

      const agentIds = buckets.map((bucket) => String(bucket.key));
      const agents =
        agentIds.length > 0
          ? await getAgentConfigurations(auth, {
              agentIds,
              variant: "light",
            })
          : [];
      const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));

      const rows = buckets.map((bucket) => {
        const agentId = String(bucket.key);
        const agent = agentsById.get(agentId);
        return {
          agentId,
          name: agent?.name ?? "Unknown agent",
          pictureUrl: agent?.pictureUrl ?? null,
          messageCount: bucket.doc_count ?? 0,
          userCount: Math.round(bucket.unique_users?.value ?? 0),
        };
      });

      return res.status(200).json({
        agents: rows,
      });
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
