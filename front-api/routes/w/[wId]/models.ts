import {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/model_configs";
import { config as regionConfig } from "@app/lib/api/regions/config";
import {
  filterCustomAvailableAndWhitelistedModels,
  getWhitelistedProviders,
} from "@app/lib/assistant";
import { getFeatureFlags } from "@app/lib/auth";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { Hono } from "hono";

export type GetAvailableModelsResponseType = {
  models: ModelConfigurationType[];
  reasoningModels: ModelConfigurationType[];
};

// Mounted at /api/w/:wId/models.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const featureFlags = await getFeatureFlags(auth);
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.plan();
  const region = regionConfig.getCurrentRegion();
  const whitelistedProviders = getWhitelistedProviders(auth);

  // Include both standard models and custom models (from GCS at build time).
  const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
  const models = filterCustomAvailableAndWhitelistedModels(allUsedModels, {
    featureFlags,
    plan,
    owner,
    region,
    whitelistedProviders,
  });
  const reasoningModels = filterCustomAvailableAndWhitelistedModels(
    REASONING_MODEL_CONFIGS,
    {
      featureFlags,
      plan,
      owner,
      region,
      whitelistedProviders,
    }
  );

  const body: GetAvailableModelsResponseType = { models, reasoningModels };
  return ctx.json(body);
});

export default app;
