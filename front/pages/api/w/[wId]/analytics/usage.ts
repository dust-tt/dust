import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
  interval: z.enum(["day", "week"]).optional(),
});
export const DEFAULT_PERIOD_DAYS = 30;

export type GetWorkspaceUsageMetricsResponse = {
  points: {
    timestamp: number;
    costCents: number;
  }[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceUsageMetricsResponse>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET": {
      const q = QuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const days = q.data.days ?? DEFAULT_PERIOD_DAYS;
      const interval = q.data.interval ?? "day";

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days,
      });
      const usageMetricsResult = await fetchMessageMetrics(
        baseQuery,
        interval,
        ["costCents"]
      );
      if (usageMetricsResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve usage metrics: ${usageMetricsResult.error.message}`,
          },
        });
      }

      return res.status(200).json({
        points: usageMetricsResult.value,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
