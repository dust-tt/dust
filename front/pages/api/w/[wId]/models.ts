import type { NextApiRequest, NextApiResponse } from "next";

import {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { isModelAvailableAndWhitelisted } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WithAPIErrorResponse } from "@app/types/error";

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
      // Include both standard models and custom models (from GCS at build time)
      const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
      const models: ModelConfigurationType[] = allUsedModels.filter((m) =>
        isModelAvailableAndWhitelisted(m, featureFlags, plan, owner)
      );
      const reasoningModels: ModelConfigurationType[] =
        REASONING_MODEL_CONFIGS.filter((m) =>
          isModelAvailableAndWhitelisted(m, featureFlags, plan, owner)
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
