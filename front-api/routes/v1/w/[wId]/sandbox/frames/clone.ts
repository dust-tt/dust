import {
  type CloneFrameV2SourceError,
  type CloneFrameV2SourceResult,
  cloneFrameV2Source,
  isFrameSourceCloneError,
} from "@app/lib/api/frames/clone_source";
import { isFramePublicationError } from "@app/lib/api/frames/publication_storage";
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

const FrameCloneRequestSchema = z.object({
  destinationDirectoryPath: z.string().min(1),
  sourceDirectoryPath: z.string().min(1),
});

function frameCloneErrorStatus(
  error: CloneFrameV2SourceError
): 400 | 403 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }
  if (isFrameSourceCloneError(error)) {
    return 400;
  }
  if (isFramePublicationError(error)) {
    return error.code === "unauthorized" ? 403 : 400;
  }
  const code = error.code;
  switch (code) {
    case "internal":
    case "reconcile_failed":
    case "sandbox_unavailable":
      return 500;
    case "build_failed":
    case "invalid_contract":
    case "invalid_path":
    case "not_found":
    case "publish_conflict":
    case "reconcile_blocked":
    case "schema_extraction_failed":
      return 400;
    default:
      return assertNever(code);
  }
}

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameCloneRequestSchema),
  async (ctx): HandlerResult<CloneFrameV2SourceResult> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot clone Frames.",
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
    const cloned = await cloneFrameV2Source(auth, {
      conversation: conversation.toJSON(),
      destinationDirectoryPath,
      sourceDirectoryPath,
    });
    if (cloned.isErr()) {
      const status = frameCloneErrorStatus(cloned.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: cloned.error.message,
        },
      });
    }

    return ctx.json(cloned.value, 200);
  }
);

export default app;
