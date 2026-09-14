import {
  FrameShareLinkError,
  type FrameShareLinkResult,
  type GetFrameShareLinkFromSourceError,
  getFrameShareLinkFromSource,
} from "@app/lib/api/frames/share_link_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isDustFileSystemError } from "@app/types/file_system";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameShareLinkRequestSchema = z.object({
  sourceDirectoryPath: z.string().min(1),
});

function frameShareLinkErrorStatus(
  error: GetFrameShareLinkFromSourceError
): 400 | 403 | 404 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }
  if (error instanceof FrameShareLinkError) {
    const errorCode = error.code;
    switch (errorCode) {
      case "internal":
        return 500;
      case "invalid_source":
        return 400;
      case "not_shared":
        return 404;
      case "unauthorized":
        return 403;
      default:
        return assertNever(errorCode);
    }
  }
  return 500;
}

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get(
  "/",
  validate("query", FrameShareLinkRequestSchema),
  async (ctx): HandlerResult<FrameShareLinkResult> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot retrieve Frame share links.",
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

    const { sourceDirectoryPath } = ctx.req.valid("query");
    const shareLink = await getFrameShareLinkFromSource(auth, {
      conversation: conversation.toJSON(),
      sourceDirectoryPath,
    });
    if (shareLink.isErr()) {
      const status = frameShareLinkErrorStatus(shareLink.error);
      return apiError(
        ctx,
        {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: shareLink.error.message,
          },
        },
        shareLink.error
      );
    }

    return ctx.json(shareLink.value, 200);
  }
);

export default app;
