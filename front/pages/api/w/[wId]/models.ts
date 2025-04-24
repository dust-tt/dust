import type { NextApiRequest, NextApiResponse } from "next";

import {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { canUseModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { ModelConfigurationType, WithAPIErrorResponse } from "@app/types";

export type GetAvailableModelsResponseType = {
  models: ModelConfigurationType[];
  reasoningModels: ModelConfigurationType[];
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
      const models: ModelConfigurationType[] = USED_MODEL_CONFIGS.filter((m) =>
        canUseModel(m, featureFlags, plan, owner)
      );
      const reasoningModels: ModelConfigurationType[] =
        REASONING_MODEL_CONFIGS.filter((m) =>
          canUseModel(m, featureFlags, plan, owner)
        );

      return res.status(200).json({ models, reasoningModels });

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
