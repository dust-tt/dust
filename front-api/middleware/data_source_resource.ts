import type { MiddlewareHandler } from "hono";

import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";

declare module "hono" {
  interface ContextVariableMap {
    dataSource: DataSourceResource;
  }
}

interface DataSourceResourceOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
}

function hasPermission(
  auth: Authenticator,
  ds: DataSourceResource,
  o: DataSourceResourceOptions
): boolean {
  if (o.requireCanAdministrate && !ds.canAdministrate(auth)) return false;
  if (o.requireCanReadOrAdministrate && !ds.canReadOrAdministrate(auth))
    return false;
  if (o.requireCanRead && !ds.canRead(auth)) return false;
  if (o.requireCanWrite && !ds.canWrite(auth)) return false;
  return true;
}

/**
 * Fetches `DataSourceResource` named by `:dsId`, ensures it belongs to the
 * space already on context (set by `spaceResource`), enforces the requested
 * permission, and stashes it on `c.var.dataSource`. Mirrors
 * `withDataSourceFromRoute` in `front/lib/api/resource_wrappers.ts`.
 */
export function dataSourceResource(
  options: DataSourceResourceOptions
): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const dsId = c.req.param("dsId");
    if (!dsId) {
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
    const ds = await DataSourceResource.fetchById(auth, dsId);
    if (
      !ds ||
      ds.space.sId !== space.sId ||
      space.isConversations() ||
      !hasPermission(auth, ds, options)
    ) {
      return c.json(
        {
          error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        },
        404
      );
    }
    c.set("dataSource", ds);
    await next();
  };
}
