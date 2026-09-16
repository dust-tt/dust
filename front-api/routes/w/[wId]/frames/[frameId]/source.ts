import { readFrameV2EntrySource } from "@app/lib/api/frames/entry_source";
import { FileResource } from "@app/lib/resources/file_resource";
import type { GetFrameSourceResponseBody } from "@app/types/api/frame_source";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/source.
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

  const sourceResult = await readFrameV2EntrySource(auth, frame);
  if (sourceResult.isErr()) {
    const { code, message } = sourceResult.error;
    return apiError(ctx, {
      status_code: code === "invalid_file" ? 422 : 404,
      api_error: {
        type:
          code === "invalid_file" ? "invalid_request_error" : "file_not_found",
        message,
      },
    });
  }

  return ctx.json<GetFrameSourceResponseBody>(sourceResult.value);
});

export default app;
