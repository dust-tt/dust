import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { GetOAuthRedirectUriResponseBody } from "@app/types/api/oauth";
import { OAUTH_PROVIDERS, OAUTH_USE_CASES } from "@app/types/oauth/lib";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ProviderParamSchema = z.object({ provider: z.enum(OAUTH_PROVIDERS) });
const RedirectUriQuerySchema = z.object({
  useCase: z.enum(OAUTH_USE_CASES).optional(),
});

/**
 * @cc [owner:flvndvd,label:api] setup-callback-consistency
 * The advertised redirect URI MUST match the default persisted for a new OAuth
 * client for the requested provider and use case in this deployment. It MUST come
 * from server configuration. Omitting useCase MUST retain the non-connector default.
 */
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ProviderParamSchema),
  validate("query", RedirectUriQuerySchema),
  async (ctx): HandlerResult<GetOAuthRedirectUriResponseBody> => {
    const { provider } = ctx.req.valid("param");
    const { useCase } = ctx.req.valid("query");
    return ctx.json({
      redirectUri: finalizeUriForProvider({
        provider,
        connection: null,
        useCase,
      }),
    });
  }
);

export default app;
