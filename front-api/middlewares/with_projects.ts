import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PokeProjectCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Resolves the `:projectId` route param into a project `SpaceResource`, 404s if
 * it is missing or not a project, and stashes it on the context under `space`.
 * Apply at the `[projectId]` level so sub-routes read `ctx.get("space")` instead
 * of each re-fetching and re-validating the project.
 *
 * Apply after the poke auth middleware so `ctx.get("auth")` is available.
 */
export function withProject() {
  return createMiddleware<PokeProjectCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const projectId = ctx.req.param("projectId");

    const space = projectId
      ? await SpaceResource.fetchById(auth, projectId)
      : null;
    if (!space || !space.isProject()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Project not found.",
        },
      });
    }

    ctx.set("space", space);
    await next();
  });
}
