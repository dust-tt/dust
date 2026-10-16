import { makeFrameDraftLive } from "@app/lib/api/frames/make_live";
import { FileResource } from "@app/lib/resources/file_resource";
import type { PostMakeFrameDraftLiveResponseBody } from "@app/types/api/frame_make_live";
import { MakeFrameDraftLiveRequestBodySchema } from "@app/types/api/frame_make_live";
import { frameMakeLiveApiError } from "@front-api/lib/api/frame_make_live_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/make-live.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", MakeFrameDraftLiveRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { frameId } = ctx.req.valid("param");
    const { draftPublicationId } = ctx.req.valid("json");

    const frame = await FileResource.fetchById(auth, frameId);
    if (!frame?.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId,
    });
    if (result.isErr()) {
      return apiError(ctx, frameMakeLiveApiError(result.error), result.error);
    }

    return ctx.json<PostMakeFrameDraftLiveResponseBody>(result.value);
  }
);

export default app;
