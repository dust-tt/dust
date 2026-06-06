/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { GetReinforcementDailySpendResponseBody } from "@app/lib/api/skills";
import type { Authenticator } from "@app/lib/auth";
import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetReinforcementDailySpendResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can view self-improving skills daily spend.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const period = await getCurrentPeriod(auth);

      const dailyMap =
        await SelfImprovingSkillsUsageResource.getDailySpendMicroUsdWithMarkup(
          auth,
          {
            startDate: period.cycleStart,
            endDate: period.cycleEnd,
          }
        );

      const dailySpendMicroUsd: Record<string, number> = {};
      for (const [day, spend] of dailyMap) {
        dailySpendMicroUsd[day] = spend;
      }

      return res.status(200).json({
        dailySpendMicroUsd,
        periodStartDate: period.cycleStart.toISOString(),
        periodEndDate: period.cycleEnd.toISOString(),
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
