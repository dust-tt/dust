import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { filterEnabledModels } from "@app/lib/assistant";
import { getFeatureFlags } from "@app/lib/auth";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetEnabledModelsResponseType = {
  models: ModelConfigurationType[];
};

// Mounted at /api/w/:wId/models.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetEnabledModelsResponseType> => {
  const auth = ctx.get("auth");

  const featureFlags = await getFeatureFlags(auth);
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.plan();
  const region = regionConfig.getCurrentRegion();
  const whitelistedProviders = getWhitelistedProviders(auth);

  // Include both standard models and custom models (from GCS at build time).
  const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
  const models = filterEnabledModels(allUsedModels, {
    featureFlags,
    plan,
    regionalModelsOnly: owner.regionalModelsOnly,
    region,
    whitelistedProviders,
  });

  return ctx.json({ models });
});

export default app;
