import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { SkillConfigurationWithAuthor } from "@app/types/skill_configuration";

export type GetSkillConfigurationsResponseBody = {
  skillConfigurations: SkillConfigurationWithAuthor[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSkillConfigurationsResponseBody>
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
        message: "Skills are not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const skillConfigurations =
        await SkillConfigurationResource.fetchWithAuthor(auth);

      return res.status(200).json({
        skillConfigurations: skillConfigurations.map((sc) => sc.toJSON()),
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
