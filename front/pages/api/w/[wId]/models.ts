// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { filterEnabledModels } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetEnabledModelsResponseType = {
  models: ModelConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetEnabledModelsResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const featureFlags = await getFeatureFlags(auth);
      const owner = auth.getNonNullableWorkspace();
      const plan = auth.plan();
      const region = regionConfig.getCurrentRegion();
      const whitelistedProviders = getWhitelistedProviders(auth);

      // Include both standard models and custom models (from GCS at build time)
      const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
      const models = filterEnabledModels(allUsedModels, {
        featureFlags,
        plan,
        regionalModelsOnly: owner.regionalModelsOnly,
        region,
        whitelistedProviders,
      });

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
