import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { ActiveUsersMetricsPoint } from "@app/lib/api/assistant/observability/active_users_metrics";
import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type GetWorkspaceActiveUsersResponse = {
  points: ActiveUsersMetricsPoint[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceActiveUsersResponse>>,
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
      const { days: queryDays } = req.query;
      const q = QuerySchema.safeParse({ days: queryDays });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const { days } = q.data;
      const owner = auth.getNonNullableWorkspace();

      const result = await fetchActiveUsersMetrics(owner.sId, days);

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve active users metrics: ${result.error.message}`,
          },
        });
      }

      return res.status(200).json({
        points: result.value,
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
