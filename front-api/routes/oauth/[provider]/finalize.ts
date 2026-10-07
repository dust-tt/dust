import { finalizeConnection, getProviderStrategy } from "@app/lib/api/oauth";
import {
  oauthFinalizeNonceCookieName,
  oauthFinalizeNonceCookieOptions,
} from "@app/lib/api/oauth/finalize_binding";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { isOAuthProvider } from "@app/types/oauth/lib";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { deleteCookie, getCookie } from "hono/cookie";
import { z } from "zod";

export type GetOauthFinalizeResponseBody =
  | { connection: OAuthConnectionType }
  | { authorize_url: string };

const ParamsSchema = z.object({
  provider: z.string(),
});

const app = sessionApp();

app.use("*", sessionAuth);

/** @ignoreswagger */
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
    // Prefer a workspace-scoped authenticator when the session carries a
    // workspace claim. Cross-region callbacks may still yield an authenticator
    // with a user but no local workspace row — ownership then uses
    // session.workspaceId. When the session has no workspace claim, resolve the
    // user alone so ownership can fail closed rather than skipping checks.
    let auth = session.workspaceId
      ? await Authenticator.fromSession(session, session.workspaceId)
      : null;

    if (!auth?.user()) {
      const user = await Authenticator.userFromSession(session);
      if (user) {
        auth = new Authenticator({
          user,
          role: "none",
          permissions: GroupPermissions.empty(),
          workspace: null,
          subscription: null,
          authMethod: "session",
        });
      }
    }

    const query = ctx.req.query();
    const connectionId =
      getProviderStrategy(provider).connectionIdFromQuery(query);
    const finalizeNonce = connectionId
      ? getCookie(ctx, oauthFinalizeNonceCookieName(connectionId))
      : undefined;

    const cRes = await finalizeConnection(auth, provider, query, {
      sessionWorkspaceId: session.workspaceId,
      finalizeNonce,
    });
    if (!cRes.isOk()) {
      if (cRes.error.code === "connection_ownership_mismatch") {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: cRes.error.message,
          },
        });
      }
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: cRes.error.message,
        },
      });
    }

    // Keep the nonce cookie across a continue-authorize redirect; the user
    // will hit finalize again after GitHub user OAuth and still needs the bind.
    if (cRes.value.type === "continue_authorize") {
      return ctx.json({ authorize_url: cRes.value.authorizeUrl });
    }

    // Consume the nonce cookie so a stolen callback URL cannot be replayed
    // from another browser that somehow obtained the same Dust session.
    if (connectionId) {
      deleteCookie(
        ctx,
        oauthFinalizeNonceCookieName(connectionId),
        oauthFinalizeNonceCookieOptions()
      );
    }

    return ctx.json({ connection: cRes.value.connection });
  }
);

export default app;
