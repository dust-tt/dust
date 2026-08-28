import {
  isFrameSharingError,
  type ShareFrameV2FromSourceError,
  type ShareFrameV2FromSourceResult,
  shareFrameV2FromSource,
} from "@app/lib/api/frames/share_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { isSandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isDustFileSystemError } from "@app/types/file_system";
import { fileShareScopeSchema, MAX_EMAILS_PER_INVITE } from "@app/types/files";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameShareRequestSchema = z.object({
  emails: z.array(z.string().email()).max(MAX_EMAILS_PER_INVITE).default([]),
  shareScope: fileShareScopeSchema.exclude(["workspace"]),
  sourceDirectoryPath: z.string().min(1),
});

function frameShareErrorStatus(
  error: ShareFrameV2FromSourceError
): 400 | 403 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }
  if (isFrameSharingError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
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
  validate("json", FrameShareRequestSchema),
  async (ctx): HandlerResult<ShareFrameV2FromSourceResult> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot share Frames.",
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

    const { emails, shareScope, sourceDirectoryPath } = ctx.req.valid("json");
    const shared = await shareFrameV2FromSource(auth, {
      conversation: conversation.toJSON(),
      emails,
      shareScope,
      sourceDirectoryPath,
    });
    if (shared.isErr()) {
      const status = frameShareErrorStatus(shared.error);
      return apiError(
        ctx,
        {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: shared.error.message,
          },
        },
        shared.error
      );
    }

    return ctx.json(shared.value, 200);
  }
);

export default app;
