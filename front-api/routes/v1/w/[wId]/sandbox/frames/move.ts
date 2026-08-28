import {
  isFrameSourceMoveError,
  type MoveFrameV2SourceError,
  moveFrameV2Source,
} from "@app/lib/api/frames/move_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { isSandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isDustFileSystemError } from "@app/types/file_system";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameMoveRequestSchema = z.object({
  destinationDirectoryPath: z.string().min(1),
  sourceDirectoryPath: z.string().min(1),
});

type FrameMoveResponse = {
  destinationDirectoryPath: string;
  frameId: string;
  sourceDeletionFailed: boolean;
};

function frameMoveErrorStatus(error: MoveFrameV2SourceError): 400 | 403 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }
  if (isFrameSourceMoveError(error)) {
    return error.code === "internal" ? 500 : 400;
  }
  if (isSandboxFunctionError(error)) {
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
  validate("json", FrameMoveRequestSchema),
  async (ctx): HandlerResult<FrameMoveResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot move Frames.",
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

    const { destinationDirectoryPath, sourceDirectoryPath } =
      ctx.req.valid("json");
    const moved = await moveFrameV2Source(auth, {
      conversation: conversation.toJSON(),
      destinationDirectoryPath,
      sourceDirectoryPath,
    });
    if (moved.isErr()) {
      const status = frameMoveErrorStatus(moved.error);
      return apiError(
        ctx,
        {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: moved.error.message,
          },
        },
        moved.error
      );
    }

    return ctx.json(moved.value, 200);
  }
);

export default app;
