import { getSessionFromBearerToken } from "@app/lib/auth";
import type { SessionCtx } from "@front-api/middlewares/ctx";
import { createMiddleware } from "hono/factory";

import { apiError } from "./utils";

/**
 * Authenticates a public-API request using a bearer token only (no workspace
 * context required). Mirrors `withTokenAuthentication` from
 * `front/lib/api/auth_wrappers.ts`.
 *
 * Stashes the resolved `SessionWithUser` on the Hono context under `session`.
 * Use for endpoints like `/api/v1/me` that identify the caller without
 * requiring a workspace ID in the URL.
 */
export const tokenAuth = createMiddleware<SessionCtx>(async (ctx, next) => {
  const authHeader = ctx.req.header("authorization");

  const bearerRes = await getSessionFromBearerToken(authHeader);
  if (bearerRes.isErr()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: bearerRes.error,
        message:
          "The request does not have valid authentication credentials.",
      },
    });
  }

  const session = bearerRes.value;
  if (session?.authenticationMethod !== "bearer") {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message:
          "The request does not have valid authentication credentials.",
      },
    });
  }

  ctx.set("session", session);
  await next();
});
