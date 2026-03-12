import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { SkillUsagePoint } from "@app/lib/api/assistant/observability/skill_usage";
import { fetchSkillUsageMetrics } from "@app/lib/api/assistant/observability/skill_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  skillName: z.string().optional(),
  timezone: z.string().optional().default("UTC"),
});

export type GetWorkspaceSkillUsageResponse = {
  points: SkillUsagePoint[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceSkillUsageResponse>>,
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
      const {
        days: queryDays,
        skillName: querySkillName,
        timezone: queryTimezone,
      } = req.query;
      const q = QuerySchema.safeParse({
        days: queryDays,
        skillName: isString(querySkillName) ? querySkillName : undefined,
        timezone: queryTimezone,
      });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const { days, skillName, timezone } = q.data;
      const owner = auth.getNonNullableWorkspace();

      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days,
      });

      const usageResult = await fetchSkillUsageMetrics(
        baseQuery,
        skillName ?? null,
        timezone
      );

      if (usageResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve skill usage metrics: ${usageResult.error.message}`,
          },
        });
      }

      return res.status(200).json({
        points: usageResult.value,
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
