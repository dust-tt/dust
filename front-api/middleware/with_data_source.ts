import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type {
  DataSourceEnv,
  SpaceEnv,
  WorkspaceAuthEnv,
} from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { createMiddleware } from "hono/factory";

interface WithDataSourceOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
}

function hasPermission(
  auth: Authenticator,
  ds: DataSourceResource,
  o: WithDataSourceOptions
): boolean {
  if (o.requireCanAdministrate && !ds.canAdministrate(auth)) {
    return false;
  }
  if (o.requireCanReadOrAdministrate && !ds.canReadOrAdministrate(auth)) {
    return false;
  }
  if (o.requireCanRead && !ds.canRead(auth)) {
    return false;
  }
  if (o.requireCanWrite && !ds.canWrite(auth)) {
    return false;
  }
  return true;
}

/**
 * Fetches `DataSourceResource` named by `:dsId`, ensures it belongs to the
 * space already on context (set by `withSpace`), enforces the requested
 * permission, and stashes it on `ctx.var.dataSource`. Mirrors
 * `withDataSourceFromRoute` in `front/lib/api/resource_wrappers.ts`.
 */
export function withDataSource(options: WithDataSourceOptions) {
  return createMiddleware<WorkspaceAuthEnv & SpaceEnv & DataSourceEnv>(
    async (ctx, next) => {
      const auth = ctx.get("auth");
      const space = ctx.get("space");
      const dsId = ctx.req.param("dsId");
      if (!dsId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid path parameters.",
          },
        });
      }
      const ds = await DataSourceResource.fetchById(auth, dsId);
      if (
        !ds ||
        ds.space.sId !== space.sId ||
        space.isConversations() ||
        !hasPermission(auth, ds, options)
      ) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }
      ctx.set("dataSource", ds);
      await next();
    }
  );
}
