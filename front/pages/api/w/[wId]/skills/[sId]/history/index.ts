import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import { GetSkillHistoryQuerySchema } from "@app/types/api/internal/skill";
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";

export type GetSkillHistoryResponseBody = {
  history: SkillWithVersionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSkillHistoryResponseBody | void>
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

  if (!skill || !skill.canWrite(auth)) {
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
      const queryValidation = GetSkillHistoryQuerySchema.decode({
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

      let skillVersionResources = await skill.listVersions(auth);

      if (limit) {
        skillVersionResources = skillVersionResources.slice(0, limit);
      }

      const skillVersions = skillVersionResources.map((resource) => ({
        ...resource.toJSON(auth),
        version: resource.version,
      }));

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
