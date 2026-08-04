/** @ignoreswagger */

import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import type { GetOAuthSetupResponseBody } from "@app/types/api/oauth";
import {
  ExtraConfigTypeSchema,
  OAUTH_PROVIDERS,
  OAUTH_USE_CASES,
} from "@app/types/oauth/lib";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
      switch (urlRes.error.code) {
        case "mcp_server_connection_not_found":
          // The message is user-facing, crafted in `verifyWorkspaceOAuthConnectionForMCPServer`.
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "mcp_server_connection_not_found",
              message: urlRes.error.message,
            },
          });
        case "connection_creation_failed":
        case "connection_not_implemented":
        case "connection_finalization_failed":
        case "credential_retrieval_failed":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: urlRes.error.message,
            },
          });
        default:
          return assertNever(urlRes.error.code);
      }
    }

    return ctx.json({ redirectUrl: urlRes.value });
  }
);

export default app;
