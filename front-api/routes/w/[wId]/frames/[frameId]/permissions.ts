import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { FileResource } from "@app/lib/resources/file_resource";
import type { GetFramePermissionsResponseBody } from "@app/types/api/frame_permissions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/permissions.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { frameId } = ctx.req.valid("param");
  const frame = await FileResource.fetchById(auth, frameId);

  if (!frame?.isFrameV2) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Frame not found." },
    });
  }

  return ctx.json<GetFramePermissionsResponseBody>({
    isFrameAuthor: await canWriteFrameV2Source(auth, frame),
  });
});

export default app;
