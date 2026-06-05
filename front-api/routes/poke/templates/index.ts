import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import { buildSharedTemplateAttributes } from "@app/lib/api/poke/templates";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { AssistantTemplateListType } from "@app/lib/resources/template_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import {
  CreateTemplateFormSchema,
  isTemplateTagCodeArray,
} from "@app/types/assistant/templates";
import { isDevelopment } from "@app/types/shared/env";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

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
//
// `CreateTemplateFormSchema` is a shared io-ts codec also used by the
// template form component (`ioTsResolver`); migrating it to zod is out of
// scope for this PR, so io-ts is used inline here.
const app = pokeApp();

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
  const bodyValidation = CreateTemplateFormSchema.decode(body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The request body is invalid: ${pathError}`,
      },
    });
  }
  const data = bodyValidation.right;

  if (!isTemplateTagCodeArray(data.tags)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The request body is invalid: tags must be an array of template tag names.",
      },
    });
  }

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
    ...buildSharedTemplateAttributes({ ...data, tags: data.tags }, model),
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
