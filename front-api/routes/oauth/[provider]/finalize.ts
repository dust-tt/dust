import { finalizeConnection } from "@app/lib/api/oauth";
import { Authenticator } from "@app/lib/auth";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { isOAuthProvider } from "@app/types/oauth/lib";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type GetOauthFinalizeResponseBody = { connection: OAuthConnectionType };

const ParamsSchema = z.object({
  provider: z.string(),
});

const app = sessionApp();

app.use("*", sessionAuth);

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetOauthFinalizeResponseBody> => {
    const { provider } = ctx.req.valid("param");
    if (!isOAuthProvider(provider)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Unknown OAuth provider.",
        },
      });
    }

    const session = ctx.get("session");
    const auth = session.workspaceId
      ? await Authenticator.fromSession(session, session.workspaceId)
      : null;

    const cRes = await finalizeConnection(auth, provider, ctx.req.query());
    if (!cRes.isOk()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: cRes.error.message,
        },
      });
    }

    return ctx.json({ connection: cRes.value });
  }
);

export default app;
