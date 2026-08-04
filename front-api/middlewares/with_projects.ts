import { fetchProjectPodFunction } from "@app/lib/api/poke/pod_functions";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  PokePodFunctionCtx,
  PokeProjectCtx,
} from "@front-api/middlewares/ctx";
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

/**
 * Resolves the `:functionId` route param into the pod function of the context project, 404s if it
 * belongs to another pod, and stashes it on the context under `podFunction`.
 *
 * Apply after `withProject()` so `ctx.get("space")` is available.
 */
export function withPodFunction() {
  return createMiddleware<PokePodFunctionCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const functionId = ctx.req.param("functionId");

    const podFunction = functionId
      ? await fetchProjectPodFunction(auth, space, functionId)
      : null;
    if (!podFunction) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Pod function not found.",
        },
      });
    }

    ctx.set("podFunction", podFunction);
    await next();
  });
}
