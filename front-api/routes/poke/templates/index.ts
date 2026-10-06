import { buildSharedTemplateAttributes } from "@app/lib/api/poke/templates";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { AssistantTemplateListType } from "@app/lib/resources/template_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { USED_MODEL_CONFIGS } from "@app/types/assistant/models/used_model_configs";
import { CreateTemplateFormSchema } from "@app/types/assistant/templates";
import { isDevelopment } from "@app/types/shared/env";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { fromError } from "zod-validation-error";

import tId from "./[tId]";
import pull from "./pull";

export interface CreateTemplateResponseBody {
  success: boolean;
}

interface PokeFetchAssistantTemplatesResponse {
  templates: AssistantTemplateListType[];
  dustRegionSyncEnabled: boolean;
}

// Mounted at /api/poke/templates. pokeAuth is applied by the parent poke
// sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<PokeFetchAssistantTemplatesResponse> => {
    const templates = await TemplateResource.listAll();

    return ctx.json({
      templates: templates.map((t) => t.toListJSON()),
      dustRegionSyncEnabled: regionConfig.getDustRegionSyncEnabled(),
    });
  }
);

app.post("/", async (ctx): HandlerResult<CreateTemplateResponseBody> => {
  const body = await ctx.req.json().catch(() => null);
  const bodyValidation = CreateTemplateFormSchema.safeParse(body);
  if (!bodyValidation.success) {
    const pathError = fromError(bodyValidation.error).toString();
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The request body is invalid: ${pathError}`,
      },
    });
  }
  const data = bodyValidation.data;

  if (regionConfig.getDustRegionSyncEnabled() && !isDevelopment()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot create templates in non-main regions.",
      },
    });
  }

  const model = USED_MODEL_CONFIGS.find(
    (cfg) => cfg.modelId === data.presetModelId
  );

  if (!model) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The request body is invalid: model not found.",
      },
    });
  }

  await TemplateResource.makeNew({
    ...buildSharedTemplateAttributes(data, model),
    // Not configurable in the template, keeping the column for now since some
    // templates do have a custom temperature.
    presetTemperature: "balanced",
  });

  return ctx.json({ success: true });
});

// Register the literal `/pull` route BEFORE the param route so it isn't
// swallowed as a `:tId`.
app.route("/pull", pull);
app.route("/:tId", tId);

export default app;
