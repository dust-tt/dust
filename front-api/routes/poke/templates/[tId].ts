import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import { buildSharedTemplateAttributes } from "@app/lib/api/poke/templates";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { TemplateResource } from "@app/lib/resources/template_resource";
import {
  CreateTemplateFormSchema,
  isTemplateTagCodeArray,
} from "@app/types/assistant/templates";
import { isDevelopment } from "@app/types/shared/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { isLeft } from "fp-ts/lib/Either";
import { Hono } from "hono";
import * as reporter from "io-ts-reporters";

export type PokeFetchAssistantTemplateResponse = ReturnType<
  TemplateResource["toJSON"]
>;

interface PokeCreateTemplateResponseBody {
  success: boolean;
}

// Mounted at /api/poke/templates/:tId. pokeAuth is applied by the parent poke
// sub-app.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeFetchAssistantTemplateResponse> => {
  const templateId = ctx.req.param("tId") ?? "";
  if (!templateId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

  return ctx.json(template.toJSON());
});

app.patch("/", async (ctx): HandlerResult<PokeCreateTemplateResponseBody> => {
  const templateId = ctx.req.param("tId") ?? "";
  if (!templateId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

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
        message: "Cannot update templates in non-main regions.",
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

  const existingTemplate = await TemplateResource.fetchByExternalId(templateId);
  if (!existingTemplate) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

  await existingTemplate.updateAttributes({
    ...buildSharedTemplateAttributes({ ...data, tags: data.tags }, model),
    timeFrameDuration: data.timeFrameDuration
      ? parseInt(data.timeFrameDuration, 10)
      : null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    timeFrameUnit: data.timeFrameUnit || null,
  });

  return ctx.json({ success: true });
});

app.delete("/", async (ctx): HandlerResult<PokeCreateTemplateResponseBody> => {
  const auth = ctx.get("auth");
  const templateId = ctx.req.param("tId") ?? "";
  if (!templateId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

  await template.delete(auth);

  return ctx.json({ success: true });
});

export default app;
