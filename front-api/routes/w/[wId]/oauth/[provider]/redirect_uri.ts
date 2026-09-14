import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { GetOAuthRedirectUriResponseBody } from "@app/types/api/oauth";
import { OAUTH_PROVIDERS } from "@app/types/oauth/lib";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ProviderParamSchema = z.object({ provider: z.enum(OAUTH_PROVIDERS) });

/**
 * @cc [owner:flvndvd,label:api] setup-callback-consistency
 * The advertised redirect URI MUST match the default persisted for a new OAuth
 * client in this deployment. It MUST come from server configuration.
 */
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ProviderParamSchema),
  async (ctx): HandlerResult<GetOAuthRedirectUriResponseBody> => {
    const { provider } = ctx.req.valid("param");
    return ctx.json({
      redirectUri: finalizeUriForProvider({ provider, connection: null }),
    });
  }
);

export default app;
