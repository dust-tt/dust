import { getFeatureFlags } from "@app/lib/auth";
import { getEnabledModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import type { GetAvailableModelsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";

// Mounted at /api/v1/w/:wId/models.
const app = publicApiApp();

/**
 * @ignoreswagger
 * System-key-only internal endpoint, not part of the public API docs.
 *
 * Lists the models that can be requested as a per-message model override
 * (see `modelSelection` on the messages endpoints). Returns an empty list
 * when the workspace does not have the models picker feature enabled.
 */
app.get("/", ensureIsSystemKey(), async (ctx) => {
  const auth = ctx.get("auth");

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("models_picker")) {
    const body: GetAvailableModelsResponseType = { models: [] };
    return ctx.json(body);
  }

  const models = await getEnabledModelsForAuth(auth);

  const body: GetAvailableModelsResponseType = {
    models: models
      // The auto pseudo-model is not a requestable model: omitting
      // `modelSelection` already yields the default behavior.
      .filter((m) => m.isSelectable && m.modelId !== AUTO_MODEL_ID)
      .map((m) => ({
        providerId: m.providerId,
        modelId: m.modelId,
        displayName: m.displayName,
        supportedReasoningEfforts: getAvailableReasoningEfforts(
          m.supportedReasoningEfforts
        ),
        defaultReasoningEffort: m.defaultReasoningEffort,
      })),
  };

  return ctx.json(body);
});

export default app;
