import type { MiddlewareHandler } from "hono";

import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

declare module "hono" {
  interface ContextVariableMap {
    dataSourceView: DataSourceViewResource;
  }
}

interface DataSourceViewResourceOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
}

function hasPermission(
  auth: Authenticator,
  view: DataSourceViewResource,
  o: DataSourceViewResourceOptions
): boolean {
  if (o.requireCanAdministrate && !view.canAdministrate(auth)) return false;
  if (o.requireCanReadOrAdministrate && !view.canReadOrAdministrate(auth))
    return false;
  if (o.requireCanRead && !view.canRead(auth)) return false;
  if (o.requireCanWrite && !view.canWrite(auth)) return false;
  return true;
}

/**
 * Fetches `DataSourceViewResource` named by `:dsvId`, ensures it belongs to
 * the space already on context (set by `spaceResource`), enforces the
 * requested permission, and stashes it on `c.var.dataSourceView`.
 * Mirrors `withDataSourceViewFromRoute` in
 * `front/lib/api/resource_wrappers.ts`.
 */
export function dataSourceViewResource(
  options: DataSourceViewResourceOptions
): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const dsvId = c.req.param("dsvId");
    if (!dsvId) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid path parameters.",
          },
        },
        400
      );
    }
    const view = await DataSourceViewResource.fetchById(auth, dsvId);
    if (
      !view ||
      view.space.sId !== space.sId ||
      space.isConversations() ||
      !hasPermission(auth, view, options)
    ) {
      return c.json(
        {
          error: {
            type: "data_source_view_not_found",
            message: "The data source view you requested was not found.",
          },
        },
        404
      );
    }
    c.set("dataSourceView", view);
    await next();
  };
}
