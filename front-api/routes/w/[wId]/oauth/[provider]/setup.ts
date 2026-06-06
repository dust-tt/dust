/** @ignoreswagger */

import type { GetOAuthSetupResponseBody } from "@app/lib/api/oauth";
import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import {
  ExtraConfigTypeSchema,
  OAUTH_PROVIDERS,
  OAUTH_USE_CASES,
} from "@app/types/oauth/lib";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ProviderParamSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
});

const SetupQuerySchema = z.object({
  useCase: z.enum(OAUTH_USE_CASES),
  extraConfig: z.string().optional(),
  openerOrigin: z.string().optional(),
});

// Mounted at /api/w/:wId/oauth/:provider/setup.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ProviderParamSchema),
  validate("query", SetupQuerySchema),
  async (ctx): HandlerResult<GetOAuthSetupResponseBody> => {
    const auth = ctx.get("auth");
    const { provider } = ctx.req.valid("param");
    const { useCase, extraConfig, openerOrigin } = ctx.req.valid("query");

    let parsedExtraConfig: z.infer<typeof ExtraConfigTypeSchema> = {};
    if (extraConfig) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(extraConfig);
      } catch {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid extraConfig JSON.",
          },
        });
      }
      const bodyValidation = ExtraConfigTypeSchema.safeParse(parsed);
      if (!bodyValidation.success) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid extraConfig format.",
          },
        });
      }
      parsedExtraConfig = bodyValidation.data;
    }

    const urlRes = await createConnectionAndGetSetupUrl(
      auth,
      provider,
      useCase,
      parsedExtraConfig,
      openerOrigin
    );

    if (!urlRes.isOk()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: urlRes.error.message,
        },
      });
    }

    return ctx.json({ redirectUrl: urlRes.value });
  }
);

export default app;
