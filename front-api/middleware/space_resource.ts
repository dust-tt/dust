import type { MiddlewareHandler } from "hono";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";

declare module "hono" {
  interface ContextVariableMap {
    space: SpaceResource;
  }
}

interface SpaceResourceOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
}

function hasPermission(
  auth: Authenticator,
  space: SpaceResource,
  options: SpaceResourceOptions
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
 * Apply after the auth middleware so `c.get("auth")` is available.
 */
export function spaceResource(
  options: SpaceResourceOptions
): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    const spaceId = c.req.param("spaceId");
    if (!spaceId) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid space id.",
          },
        },
        400
      );
    }

    const space = await SpaceResource.fetchById(auth, spaceId);
    if (
      !space ||
      space.isConversations() ||
      !hasPermission(auth, space, options)
    ) {
      return c.json(
        {
          error: {
            type: "space_not_found",
            message: "The space you requested was not found.",
          },
        },
        404
      );
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

    c.set("space", space);
    await next();
  };
}
