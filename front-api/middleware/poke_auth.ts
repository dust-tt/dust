import type { MiddlewareHandler } from "hono";

import {
  Authenticator,
  getSession,
  getSessionFromBearerToken,
} from "@app/lib/auth";

import { buildNextLikeReqRes } from "./utils";

/**
 * Authenticates a Poke (super-user) request and stores the resolved
 * `Authenticator` on the Hono context under the `auth` variable.
 *
 * Mirrors the behavior of `withSessionAuthenticationForPoke` in
 * `front/lib/api/auth_wrappers.ts`. Apply to any route under
 * `/api/poke/...`.
 */
export const pokeAuth: MiddlewareHandler = async (c, next) => {
  const { req, res, setCookies } = buildNextLikeReqRes(c);

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

  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return c.json(
      {
        error: {
          type: "not_authenticated",
          message: "The user does not have permission",
        },
      },
      401
    );
  }

  c.set("auth", auth);
  await next();
};
