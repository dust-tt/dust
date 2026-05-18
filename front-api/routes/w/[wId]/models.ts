import { Hono } from "hono";

import {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/model_configs";
import { filterCustomAvailableAndWhitelistedModels } from "@app/lib/assistant";
import { getFeatureFlags } from "@app/lib/auth";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export type GetAvailableModelsResponseType = {
  models: ModelConfigurationType[];
  reasoningModels: ModelConfigurationType[];
};

// Mounted at /api/w/:wId/models.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const featureFlags = await getFeatureFlags(auth);
  // Include both standard models and custom models (from GCS at build time).
  const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
  const models = filterCustomAvailableAndWhitelistedModels(
    allUsedModels,
    featureFlags,
    auth
  );
  const reasoningModels = filterCustomAvailableAndWhitelistedModels(
    REASONING_MODEL_CONFIGS,
    featureFlags,
    auth
  );

  const body: GetAvailableModelsResponseType = { models, reasoningModels };
  return c.json(body);
});

export default app;
