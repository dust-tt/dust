import {
  type RegisterFrameV2FromSourceError,
  registerFrameV2FromSource,
} from "@app/lib/api/frames/register_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isDustFileSystemError } from "@app/types/file_system";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameRegisterRequestSchema = z.object({
  manifestPath: z.string().min(1),
});

type FrameRegisterResponse = {
  frameId: string;
  manifestPath: string;
  created: boolean;
};

function frameRegisterErrorStatus(
  error: RegisterFrameV2FromSourceError
): 400 | 403 | 500 {
  if (isDustFileSystemError(error)) {
    if (error.code === "unauthorized") {
      return 403;
    }
    return error.code === "internal" ? 500 : 400;
  }

  return error.code === "unauthorized" ? 403 : 400;
}

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameRegisterRequestSchema),
  async (ctx): HandlerResult<FrameRegisterResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot register Frames.",
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
    const registration = await registerFrameV2FromSource(auth, {
      conversation: conversation.toJSON(),
      manifestPath,
    });
    if (registration.isErr()) {
      const status = frameRegisterErrorStatus(registration.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: registration.error.message,
        },
      });
    }

    return ctx.json(
      {
        frameId: registration.value.frame.sId,
        manifestPath,
        created: registration.value.created,
      },
      200
    );
  }
);

export default app;
