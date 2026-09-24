import { prewarmFrameSandbox } from "@app/lib/api/frames/prewarm_frame_sandbox";
import { FileResource } from "@app/lib/resources/file_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/prewarm.
const app = workspaceApp();

/** @ignoreswagger */
app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { frameId } = ctx.req.valid("param");
  const frame = await FileResource.fetchById(auth, frameId);

  if (!frame?.isFrameV2) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Frame not found." },
    });
  }

  // Fire-and-forget: the pre-warm decides on its own whether this viewer may wake the sandbox.
  void prewarmFrameSandbox(auth, frame);

  return ctx.body(null, 202);
});

export default app;
