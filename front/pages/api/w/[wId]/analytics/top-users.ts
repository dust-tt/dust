import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(100).optional().default(25),
});

export type WorkspaceTopUserRow = {
  userId: string;
  name: string;
  imageUrl: string | null;
  messageCount: number;
  agentCount: number;
};

export type GetWorkspaceTopUsersResponse = {
  users: WorkspaceTopUserRow[];
};

type TopUsersAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<{
    key: string;
    doc_count: number;
    unique_agents?: estypes.AggregationsCardinalityAggregate;
  }>;
};

type TopUserBucket = {
  key: string;
  doc_count: number;
  unique_agents?: estypes.AggregationsCardinalityAggregate;
};

function getUserDisplayName(user: UserResource | undefined): string {
  if (!user) {
    return "Programmatic usage";
  }
  const fullName = user.fullName();
  if (fullName) {
    return fullName;
  }
  if (user.username) {
    return user.username;
  }
  return user.email || "Programmatic usage";
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceTopUsersResponse>>,
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

      const result = await searchAnalytics<never, TopUsersAggs>(
        {
          bool: {
            filter: [baseQuery, { exists: { field: "user_id" } }],
          },
        },
        {
          aggregations: {
            by_user: {
              terms: {
                field: "user_id",
                size: q.data.limit,
              },
              aggs: {
                unique_agents: {
                  cardinality: {
                    field: "agent_id",
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
            message: `Failed to retrieve top users: ${fromError(result.error).toString()}`,
          },
        });
      }

      const buckets = bucketsToArray<TopUserBucket>(
        result.value.aggregations?.by_user?.buckets
      );

      const userIds = buckets.map((bucket) => String(bucket.key));
      const users =
        userIds.length > 0 ? await UserResource.fetchByIds(userIds) : [];
      const usersById = new Map(users.map((user) => [user.sId, user]));

      const rows = buckets.map((bucket) => {
        const userId = String(bucket.key);
        const user = usersById.get(userId);
        return {
          userId,
          name: getUserDisplayName(user),
          imageUrl: user?.imageUrl ?? null,
          messageCount: bucket.doc_count ?? 0,
          agentCount: Math.round(bucket.unique_agents?.value ?? 0),
        };
      });

      return res.status(200).json({
        users: rows,
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
