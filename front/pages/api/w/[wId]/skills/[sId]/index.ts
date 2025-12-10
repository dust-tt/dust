import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isBuilder, isString } from "@app/types";

export type DeleteSkillConfigurationResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<DeleteSkillConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!isString(req.query.sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `sId` (string) is required.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  if (!isBuilder(owner)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skills are not enabled for this workspace.",
      },
    });
  }

  const skillId = req.query.sId;

  const skillConfiguration = await SkillConfigurationResource.fetchBySId(
    auth,
    skillId
  );

  if (!skillConfiguration) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const archiveResult = await skillConfiguration.archive(auth);

      if (archiveResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error archiving skill: ${archiveResult.error.message}`,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
