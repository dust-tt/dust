import {
  FrameMakeLiveError,
  makeFrameDraftLive,
} from "@app/lib/api/frames/make_live";
import { FileResource } from "@app/lib/resources/file_resource";
import type { PostMakeFrameDraftLiveResponseBody } from "@app/types/api/frame_make_live";
import { MakeFrameDraftLiveRequestBodySchema } from "@app/types/api/frame_make_live";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { frameSourceErrorStatus } from "@front-api/lib/api/frame_source_errors";
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
      const { error } = result;
      if (error instanceof FrameMakeLiveError) {
        const code = error.code;
        switch (code) {
          case "unauthorized":
            return apiError(ctx, {
              status_code: 403,
              api_error: { type: "file_read_only", message: error.message },
            });
          case "no_draft":
            return apiError(ctx, {
              status_code: 404,
              api_error: { type: "file_not_found", message: error.message },
            });
          case "draft_conflict":
            return apiError(ctx, {
              status_code: 409,
              api_error: {
                type: "frame_draft_conflict",
                message: error.message,
              },
            });
          default:
            return assertNever(code);
        }
      }

      const status = frameSourceErrorStatus(error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type: errorTypeForStatus(status),
          message: error.message,
        },
      });
    }

    return ctx.json<PostMakeFrameDraftLiveResponseBody>(result.value);
  }
);

function errorTypeForStatus(status: 400 | 403 | 500) {
  switch (status) {
    case 400:
      return "invalid_request_error";
    case 403:
      return "file_read_only";
    case 500:
      return "internal_server_error";
    default:
      return assertNever(status);
  }
}

export default app;
