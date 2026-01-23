import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type RestoreSkillConfigurationResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<RestoreSkillConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  }

  if (!isString(req.query.sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const sId = req.query.sId;
  const skillResource = await SkillResource.fetchById(auth, sId);

  if (!skillResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      if (!skillResource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can restore this skill.",
          },
        });
      }

      // Check for existing active skill with the same name.
      const existingSkill = await SkillResource.fetchActiveByName(
        auth,
        skillResource.name
      );
      if (existingSkill) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${skillResource.name}" already exists.`,
          },
        });
      }

      await skillResource.restore(auth);

      return res.status(200).json({ success: true });
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
