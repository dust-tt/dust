import {
  type DeleteFrameV2FromSourceError,
  deleteFrameV2FromSource,
  isFrameDeletionError,
} from "@app/lib/api/frames/delete_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isDustFileSystemError } from "@app/types/file_system";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameDeleteRequestSchema = z.object({
  sourceDirectoryPath: z.string().min(1),
});

type FrameDeleteResponse = {
  frameId: string;
  sourceDirectoryPath: string;
};

function frameDeleteErrorStatus(
  error: DeleteFrameV2FromSourceError
): 400 | 403 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }
  if (isFrameDeletionError(error)) {
    return error.code === "internal" ? 500 : 400;
  }
  if (error instanceof SandboxFunctionError) {
    return error.code === "internal" ? 500 : 400;
  }
  return 500;
}

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameDeleteRequestSchema),
  async (ctx): HandlerResult<FrameDeleteResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot delete Frames.",
        },
      });
    }
    if (!(await hasFeatureFlag(auth, "frames_v2"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Frames v2 is not enabled for this workspace.",
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, claims.cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: `Conversation ${claims.cId} not found.`,
        },
      });
    }

    const { sourceDirectoryPath } = ctx.req.valid("json");
    const deleted = await deleteFrameV2FromSource(auth, {
      conversation: conversation.toJSON(),
      sourceDirectoryPath,
    });
    if (deleted.isErr()) {
      const status = frameDeleteErrorStatus(deleted.error);
      return apiError(
        ctx,
        {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: deleted.error.message,
          },
        },
        deleted.error
      );
    }

    return ctx.json(deleted.value, 200);
  }
);

export default app;
