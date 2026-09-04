import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import { validateFrameFromSource } from "@app/lib/api/frames/publish_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frameSourceErrorStatus } from "@front-api/lib/api/frame_source_errors";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameValidateRequestSchema = z.object({
  manifestPath: z.string().min(1),
});

type FrameValidateResponse = {
  frameId: string;
  manifestPath: string;
  warnings: ValidationWarning[];
};

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameValidateRequestSchema),
  async (ctx): HandlerResult<FrameValidateResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot validate Frames.",
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

    const { manifestPath } = ctx.req.valid("json");
    const validation = await validateFrameFromSource(auth, {
      conversation: conversation.toJSON(),
      sourcePath: manifestPath,
    });
    if (validation.isErr()) {
      const status = frameSourceErrorStatus(validation.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: validation.error.message,
        },
      });
    }

    return ctx.json(
      {
        frameId: validation.value.frameId,
        manifestPath: validation.value.sourcePath,
        warnings: validation.value.warnings,
      },
      200
    );
  }
);

export default app;
