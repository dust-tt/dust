/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PatchSkillReinforcementBodySchema = z.object({
  reinforcement: z.enum(SKILL_REINFORCEMENT_MODES),
});

export type PatchSkillReinforcementResponseBody = {
  skill: SkillType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchSkillReinforcementResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { sId } = req.query;
  if (!isString(sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      if (!skill.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify this skill.",
          },
        });
      }

      const validation = PatchSkillReinforcementBodySchema.safeParse(req.body);
      if (!validation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(validation.error).toString(),
          },
        });
      }

      await skill.updateReinforcement(validation.data.reinforcement);

      return res.status(200).json({ skill: skill.toJSON(auth) });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
