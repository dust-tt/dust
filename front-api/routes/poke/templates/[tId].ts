import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import type {
  PokeCreateTemplateResponseBody,
  PokeFetchAssistantTemplateResponse,
} from "@app/lib/api/poke/templates";
import { buildSharedTemplateAttributes } from "@app/lib/api/poke/templates";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { TemplateResource } from "@app/lib/resources/template_resource";
import {
  CreateTemplateFormSchema,
  isTemplateTagCodeArray,
} from "@app/types/assistant/templates";
import { isDevelopment } from "@app/types/shared/env";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/templates/:tId. pokeAuth is applied by the parent poke
// sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeFetchAssistantTemplateResponse> => {
    const { tId: templateId } = ctx.req.valid("param");

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
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeCreateTemplateResponseBody> => {
    const { tId: templateId } = ctx.req.valid("param");

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

    const existingTemplate =
      await TemplateResource.fetchByExternalId(templateId);
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
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeCreateTemplateResponseBody> => {
    const auth = ctx.get("auth");
    const { tId: templateId } = ctx.req.valid("param");

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
  }
);

export default app;
