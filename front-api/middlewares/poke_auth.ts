import { authenticateCloudflareAccess } from "@app/lib/api/poke/cloudflare_access";
import { Authenticator, isDustInternalEmail } from "@app/lib/auth";
import { getPokeRolesForUser } from "@app/lib/poke/roles";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { resolveSession } from "@front-api/middlewares/session_resolution";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

function notAuthenticated(ctx: Context) {
  return apiError(ctx, {
    status_code: 401,
    api_error: {
      type: "not_authenticated",
      message: "The user does not have permission",
    },
  });
}

/**
 * Authenticates a Poke (super-user) request and stashes an unscoped
 * `Authenticator` on the Hono context. Apply once at the `/api/poke` root;
 * workspace-scoped routes layer `withPokeWorkspace` on top.
 *
 * Cloudflare Access is the primary identity source: when it is configured, a
 * verified `Cf-Access-Jwt-Assertion` header is mandatory and the WorkOS
 * super-user session path is unreachable. WorkOS remains the only path when
 * Access is not configured at all.
 *
 * Super-user privilege is an Authenticator flag set only by poke factories
 * (`fromDustSuperUser` / `fromSuperUserSession`), not by the DB column alone.
 */
export const pokeAuth = createMiddleware<PokeCtx>(async (ctx, next) => {
  const access = await authenticateCloudflareAccess(ctx.req.raw.headers);

  switch (access.kind) {
    case "rejected":
      logger.warn(
        { reasonCode: access.reasonCode },
        "[Poke Auth] Cloudflare Access authentication rejected"
      );
      return notAuthenticated(ctx);

    case "authenticated": {
      const { user } = access;

      // Kept symmetric with the WorkOS fallback: Access policy is the primary
      // gate, but poke stays restricted to Dust employees.
      if (!isDustInternalEmail(user.email)) {
        logger.warn(
          { email: user.email },
          "[Poke Auth] Cloudflare Access user is not a Dust internal email"
        );
        return notAuthenticated(ctx);
      }

      const auth = await Authenticator.fromDustSuperUser({
        pokePrincipal: { email: user.email, name: user.name },
      });

      logger.info(
        { email: user.email, identity: user.identity.kind },
        "[Poke Auth] User logged in Poke via Cloudflare Access"
      );

      ctx.set("auth", auth);
      ctx.set("pokeRoles", await getPokeRolesForUser(user.email));
      await next();
      return;
    }

    case "disabled":
      break;

    default:
      assertNever(access);
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
    return notAuthenticated(ctx);
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
