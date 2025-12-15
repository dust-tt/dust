import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { listSkillConfigurationVersions } from "@app/lib/api/assistant/configuration/skill";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import { GetSkillConfigurationsHistoryQuerySchema } from "@app/types/api/internal/skill";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

export type GetSkillConfigurationsHistoryResponseBody = {
  history: SkillConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSkillConfigurationsHistoryResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!isString(req.query.sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID provided.",
      },
    });
  }

  const { sId } = req.query;

  // Check that user has access to this skill
  const skill = await SkillResource.fetchById(auth, sId);

  if (!skill || (!skill.canWrite(auth) && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = GetSkillConfigurationsHistoryQuerySchema.decode({
        ...req.query,
        limit:
          typeof req.query.limit === "string"
            ? parseInt(req.query.limit, 10)
            : undefined,
      });
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { limit } = queryValidation.right;

      let skillVersions = await listSkillConfigurationVersions(auth, {
        skillId: sId,
      });

      // Return the latest versions first (already sorted by version DESC)
      if (limit) {
        skillVersions = skillVersions.slice(0, limit);
      }

      return res.status(200).json({ history: skillVersions });
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
