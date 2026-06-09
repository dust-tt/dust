import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { DataSourceViewCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

interface WithDataSourceViewOptions {
  requireCanAdministrate?: boolean;
  requireCanReadOrAdministrate?: boolean;
  requireCanRead?: boolean;
  requireCanWrite?: boolean;
}

function hasPermission(
  auth: Authenticator,
  view: DataSourceViewResource,
  o: WithDataSourceViewOptions
): boolean {
  if (o.requireCanAdministrate && !view.canAdministrate(auth)) {
    return false;
  }
  if (o.requireCanReadOrAdministrate && !view.canReadOrAdministrate(auth)) {
    return false;
  }
  if (o.requireCanRead && !view.canRead(auth)) {
    return false;
  }
  if (o.requireCanWrite && !view.canWrite(auth)) {
    return false;
  }
  return true;
}

/**
 * Fetches `DataSourceViewResource` named by `:dsvId`, ensures it belongs to
 * the space already on context (set by `withSpace`), enforces the requested
 * permission, and stashes it on `ctx.var.dataSourceView`. Mirrors
 * `withDataSourceViewFromRoute` in `front/lib/api/resource_wrappers.ts`.
 */
export function withDataSourceView(options: WithDataSourceViewOptions) {
  return createMiddleware<DataSourceViewCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const dsvId = ctx.req.param("dsvId");
    if (!dsvId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid path parameters.",
        },
      });
    }
    const view = await DataSourceViewResource.fetchById(auth, dsvId);
    if (
      !view ||
      view.space.sId !== space.sId ||
      space.isConversations() ||
      !hasPermission(auth, view, options)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_view_not_found",
          message: "The data source view you requested was not found.",
        },
      });
    }
    ctx.set("dataSourceView", view);
    await next();
  });
}
