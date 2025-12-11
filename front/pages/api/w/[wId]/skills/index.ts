import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill/skill_configuration_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isBuilder } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillConfigurationType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillConfigurationsResponseBody = {
  skillConfigurations: SkillConfigurationType[];
};

export type GetSkillConfigurationsWithRelationsResponseBody = {
  skillConfigurations: (SkillConfigurationType & SkillConfigurationRelations)[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillConfigurationsResponseBody
      | GetSkillConfigurationsWithRelationsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
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

  switch (req.method) {
    case "GET": {
      const { withRelations } = req.query;

      const skillConfigurations =
        await SkillConfigurationResource.fetchAllAvailableSkills(auth);

      if (withRelations === "true") {
        // Fetch usage for each skill individually.
        // Each skill is used by N agents and each agent uses on average n skills
        // with N >> n, so the performance gain from batching is minimal.
        // Starting simple with per-skill queries.
        const skillConfigurationsWithRelations = await Promise.all(
          skillConfigurations.map(async (sc) => ({
            ...sc.toJSON(),
            usage: await sc.fetchUsage(auth),
          }))
        );

        return res
          .status(200)
          .json({ skillConfigurations: skillConfigurationsWithRelations });
      }

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
