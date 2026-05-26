import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

interface WithSpaceOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
  routeParam?: "spaceId" | "podId";
}

function hasPermission(
  auth: Authenticator,
  space: SpaceResource,
  options: WithSpaceOptions
): boolean {
  if (options.requireCanAdministrate && !space.canAdministrate(auth)) {
    return false;
  }
  if (
    options.requireCanReadOrAdministrate &&
    !space.canReadOrAdministrate(auth)
  ) {
    return false;
  }
  if (options.requireCanRead && !space.canRead(auth)) {
    return false;
  }
  if (options.requireCanWrite && !space.canWrite(auth)) {
    return false;
  }
  return true;
}

function deriveAccessMethod(auth: Authenticator): string {
  const key = auth.key();
  if (key) {
    return key.isSystem ? "system_key" : "api_key";
  }
  return "ui";
}

/**
 * Fetches the `SpaceResource` named by `:spaceId` in the route, validates it
 * (existence, not a conversations space, requested permissions), emits the
 * `space.accessed` audit log for restricted spaces, and stashes it on the
 * context under `space`. Mirrors `withSpaceFromRoute` from
 * `front/lib/api/resource_wrappers.ts`.
 *
 * Apply after the auth middleware so `ctx.get("auth")` is available.
 */
export function withSpace(options: WithSpaceOptions) {
  const routeParam = options.routeParam ?? "spaceId";
  return createMiddleware<SpaceCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const spaceId = ctx.req.param(routeParam);
    if (!spaceId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            routeParam === "podId" ? "Invalid pod id." : "Invalid space id.",
        },
      });
    }

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (
      !space ||
      space.isConversations() ||
      !hasPermission(auth, space, options)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you requested was not found.",
        },
      });
    }

    const spaceJSON = space.toJSON();
    if (spaceJSON.isRestricted) {
      void emitAuditLogEvent({
        auth,
        action: "space.accessed",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("space", space),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          space_name: space.name,
          space_kind: spaceJSON.kind,
          is_restricted: "true",
          access_method: deriveAccessMethod(auth),
        },
      });
    }

    ctx.set("space", space);
    await next();
  });
}
