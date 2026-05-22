import { finalizeConnection } from "@app/lib/api/oauth";
import { Authenticator } from "@app/lib/auth";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { isOAuthProvider } from "@app/types/oauth/lib";
import { sessionAuthApp } from "@front-api/middleware/env";
import { sessionAuth } from "@front-api/middleware/session_auth";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetOauthFinalizeResponseBody = { connection: OAuthConnectionType };

const app = sessionAuthApp();

app.use("*", sessionAuth);

app.get("/", async (ctx): HandlerResult<GetOauthFinalizeResponseBody> => {
  const provider = ctx.req.param("provider");
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
});

export default app;
