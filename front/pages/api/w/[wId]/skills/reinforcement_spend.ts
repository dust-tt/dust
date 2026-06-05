/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { GetSkillsSpendResponseBody } from "@app/lib/api/skills";
import type { Authenticator } from "@app/lib/auth";
import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSkillsSpendResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can view self-improving skills spend.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const skills = await SkillResource.listByWorkspace(auth, {
        status: "active",
        onlyCustom: true,
        withInstructions: false,
        withTools: false,
      });

      const spentByModelId =
        await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdWithMarkupAfterDateForSkills(
          auth,
          {
            createdAfter: (await getCurrentPeriod(auth)).cycleStart,
            skillModelIds: skills.map((sc) => sc.id),
          }
        );

      const spentMicroUsdBySkillId: Record<string, number> = {};
      for (const skill of skills) {
        const spent = spentByModelId.get(skill.id);
        if (spent && spent > 0) {
          spentMicroUsdBySkillId[skill.sId] = spent;
        }
      }

      return res.status(200).json({ spentMicroUsdBySkillId });
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
