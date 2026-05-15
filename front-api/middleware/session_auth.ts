import type { MiddlewareHandler } from "hono";

import { getSession, getSessionFromBearerToken } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";

import { buildNextLikeReqRes } from "./utils";

declare module "hono" {
  interface ContextVariableMap {
    session: SessionWithUser;
  }
}

/**
 * Resolves a session (bearer token or cookie) and stores the resulting
 * `SessionWithUser` on the Hono context under the `session` variable.
 *
 * Mirrors `withSessionAuthentication` in `front/lib/api/auth_wrappers.ts`.
 * Apply to routes that need a logged-in user but no workspace scoping.
 */
export const sessionAuth: MiddlewareHandler = async (c, next) => {
  const bearerRes = await getSessionFromBearerToken(
    c.req.header("authorization")
  );
  if (bearerRes.isErr()) {
    return c.json(
      {
        error: {
          type: bearerRes.error,
          message:
            "The request does not have valid authentication credentials.",
        },
      },
      401
    );
  }

  const { req, res, setCookies } = buildNextLikeReqRes(c);
  const session = bearerRes.value ?? (await getSession(req, res));

  for (const cookie of setCookies) {
    c.header("Set-Cookie", cookie, { append: true });
  }

  if (!session) {
    return c.json(
      {
        error: {
          type: "not_authenticated",
          message:
            "The user does not have an active session or is not authenticated.",
        },
      },
      401
    );
  }

  c.set("session", session);
  await next();
};
