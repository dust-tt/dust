import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { SpaceCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

interface WithSpaceOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
  // Pods are project spaces — pod-scoped surfaces 404 on any other kind.
  requireProject?: boolean;
  routeParam?: "spaceId" | "podId";
}

function hasPermission(
  auth: Authenticator,
  space: SpaceResource,
  options: WithSpaceOptions
): boolean {
  if (options.requireCanAdministrate && !auth.can("admin", space)) {
    return false;
  }
  if (
    options.requireCanReadOrAdministrate &&
    !auth.can("read", space) &&
    !auth.can("admin", space)
  ) {
    return false;
  }
  if (options.requireCanRead && !auth.can("read", space)) {
    return false;
  }
  if (options.requireCanWrite && !auth.can("write", space)) {
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
 * When the route param is absent (legacy public-API endpoints that omit the
 * space from the path, e.g. `/v1/w/:wId/apps/...`), the workspace global space
 * is used as a fallback — matching the legacy support in `withSpaceFromRoute`.
 *
 * Apply after the auth middleware so `ctx.get("auth")` is available.
 */
export function withSpace(options: WithSpaceOptions) {
  const routeParam = options.routeParam ?? "spaceId";
  return createMiddleware<SpaceCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const spaceId = ctx.req.param(routeParam);

    const space = spaceId
      ? await SpaceResource.fetchById(auth, spaceId)
      : await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    if (
      !space ||
      space.isConversations() ||
      (options.requireProject && !space.isProject()) ||
      !hasPermission(auth, space, options)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: options.requireProject
            ? "The pod you requested was not found."
            : "The space you requested was not found.",
        },
      });
    }

    // The `space.accessed` audit log must not delay the request: resolving openness costs a query,
    // and the emit is best-effort. Run the whole block off the critical path.
    void (async () => {
      // Only regular/project spaces are "restricted" (member-only); global and conversations spaces
      // are workspace-wide and system is admin-only, so none of those is audited here. `isRestricted`
      // already encodes that: a system space is not open, but is not restricted either.
      const isRestricted = await space.isRestricted(auth);
      if (isRestricted) {
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
            space_kind: space.kind,
            is_restricted: "true",
            access_method: deriveAccessMethod(auth),
          },
        });
      }
    })().catch((err) => {
      logger.error(
        {
          err,
          workspaceId: auth.getNonNullableWorkspace().sId,
          spaceId: space.sId,
        },
        "Failed to emit space.accessed audit log"
      );
    });

    ctx.set("space", space);
    await next();
  });
}
