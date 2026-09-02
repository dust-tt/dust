import { FileResource } from "@app/lib/resources/file_resource";
import type { PokeFrameCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * Resolves the `:frameId` route param into a Frames v2 `FileResource`, 404s if it is missing or is
 * any other kind of file, and stashes it on the context under `frame`. Apply at the `[frameId]`
 * level so sub-routes read `ctx.get("frame")` instead of each re-fetching and re-validating it.
 *
 * Apply after the poke auth middleware so `ctx.get("auth")` is available.
 */
export function withFrame() {
  return createMiddleware<PokeFrameCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const frameId = ctx.req.param("frameId");

    const frame = frameId ? await FileResource.fetchById(auth, frameId) : null;
    if (!frame || !frame.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "Frame not found.",
        },
      });
    }

    ctx.set("frame", frame);
    await next();
  });
}
