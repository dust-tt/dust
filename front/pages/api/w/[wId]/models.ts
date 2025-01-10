import type {
  ModelConfigurationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { isProviderWhitelisted } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { apiError } from "@app/logger/withlogging";

export type GetAvailableModelsResponseType = {
  models: ModelConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAvailableModelsResponseType>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.plan();

  switch (req.method) {
    case "GET":
      const featureFlags = await getFeatureFlags(owner);

      const models: ModelConfigurationType[] = [];
      for (const m of USED_MODEL_CONFIGS) {
        if (
          !isProviderWhitelisted(owner, m.providerId) ||
          (m.largeModel && !isUpgraded(plan))
        ) {
          continue;
        }

        if (m.featureFlag && !featureFlags.includes(m.featureFlag)) {
          continue;
        }

        if (
          m.customAssistantFeatureFlag &&
          !featureFlags.includes(m.customAssistantFeatureFlag)
        ) {
          continue;
        }

        models.push(m);
      }

      return res.status(200).json({ models });

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
