import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type GetWorkspaceAnalyticsOverviewResponse = {
  totalMembers: number;
  activeUsers: number;
};

type OverviewAggs = {
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceAnalyticsOverviewResponse>
  >,
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
      const { days } = req.query;
      const q = QuerySchema.safeParse({ days });
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

      const totalMembers =
        await MembershipResource.countActiveMembersForWorkspace({
          workspace: owner,
        });

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days: q.data.days,
      });

      const result = await searchAnalytics<never, OverviewAggs>(
        {
          bool: {
            filter: [baseQuery, { exists: { field: "user_id" } }],
          },
        },
        {
          aggregations: {
            unique_users: {
              cardinality: {
                field: "user_id",
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
            message: `Failed to retrieve analytics overview: ${fromError(result.error).toString()}`,
          },
        });
      }

      const activeUsers = Math.round(
        result.value.aggregations?.unique_users?.value ?? 0
      );

      return res.status(200).json({
        totalMembers,
        activeUsers,
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
