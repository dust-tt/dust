import {
  getCloudflareAccessConfig,
  verifyCloudflareAccessJwt,
} from "@app/lib/api/poke/cloudflare_access";
import { Authenticator, isDustInternalEmail } from "@app/lib/auth";
import { getPokeRolesForUser } from "@app/lib/poke/roles";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { resolveSession } from "@front-api/middlewares/session_resolution";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

function getCloudflareAccessToken(ctx: Context): string | undefined {
  // Cloudflare recommends validating the assertion header over the cookie.
  const headerToken = ctx.req.header("cf-access-jwt-assertion");
  if (headerToken) {
    return headerToken;
  }
  return getCookie(ctx, "CF_Authorization");
}

/**
 * Authenticates a Poke (super-user) request and stashes an unscoped
 * `Authenticator` on the Hono context. Apply once at the `/api/poke` root;
 * workspace-scoped routes layer `withPokeWorkspace` on top.
 *
 * Prefers a validated Cloudflare Access JWT (`Cf-Access-Jwt-Assertion` /
 * `CF_Authorization`) so poke operators do not need a provisioned Dust user
 * with `isDustSuperUser` on every deployment. Falls back to the WorkOS
 * super-user session path when no Access token is present.
 *
 * Super-user privilege is an Authenticator flag set only by poke factories
 * (`fromDustSuperUser` / `fromSuperUserSession`), not by the DB column alone.
 */
export const pokeAuth = createMiddleware<PokeCtx>(async (ctx, next) => {
  const accessConfig = getCloudflareAccessConfig();
  const accessToken = getCloudflareAccessToken(ctx);

  if (accessConfig && accessToken) {
    const identity = await verifyCloudflareAccessJwt(accessToken);
    if (!identity) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "Invalid Cloudflare Access token.",
        },
      });
    }

    // Note: we should maybe remove this check and fully trust the Cloudflare Access token.
    // Kept for now to be symmetric with the WorkOS fallback.
    if (!isDustInternalEmail(identity.email)) {
      logger.warn(
        {
          email: identity.email,
        },
        "[Poke Auth] Cloudflare Access token user is not a Dust internal email"
      );
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "The user does not have permission",
        },
      });
    }

    const auth = await Authenticator.fromDustSuperUser({
      pokePrincipal: {
        email: identity.email,
        name: identity.name,
      },
    });

    logger.info(
      { email: identity.email },
      "[Poke Auth] User logged in Poke via Cloudflare Access token"
    );

    const pokeRoles = await getPokeRolesForUser(identity.email);
    ctx.set("auth", auth);
    ctx.set("pokeRoles", pokeRoles);
    await next();
    return;
  }

  if (accessConfig && !accessToken && !isDevelopment()) {
    logger.warn(
      "[Poke Auth] Request missing Cloudflare Access token; falling back to WorkOS super-user session"
    );
  }

  const sessionResult = await resolveSession(ctx);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const user = await Authenticator.userFromSession(sessionResult);
  // WorkOS fallback still requires a provisioned Dust user with the DB flag.
  if (!user || !user.isDustSuperUser || !isDustInternalEmail(user.email)) {
    logger.warn(
      { userId: user?.sId, email: user?.email },
      "[Poke Auth] WorkOS fallback user is not a Dust internal email"
    );
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  }

  const auth = await Authenticator.fromDustSuperUser({ user });
  const pokeRoles = await getPokeRolesForUser(user.email);

  logger.info(
    {
      userId: user.sId,
      email: user.email,
    },
    "[Poke Auth] User logged in Poke via WorkOS fallback"
  );

  ctx.set("auth", auth);
  ctx.set("pokeRoles", pokeRoles);
  await next();
});

/**
 * Re-scopes the existing Poke `Authenticator` to the `:wId` workspace from
 * the route and 404s if the workspace cannot be resolved. Apply after
 * `pokeAuth` so the unscoped super-user `auth` is already on the context.
 */
export const withPokeWorkspace = createMiddleware<PokeCtx>(
  async (ctx, next) => {
    const wId = ctx.req.param("wId");
    if (!wId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    const current = ctx.get("auth");
    const auth = await Authenticator.fromDustSuperUser({
      user: current.user(),
      wId,
      pokePrincipal: current.getPokePrincipal(),
    });

    if (!auth.workspace()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    ctx.set("auth", auth);
    await next();
  }
);
