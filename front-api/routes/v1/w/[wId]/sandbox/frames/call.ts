import {
  type CallFrameFunctionResult,
  callFrameFunctionFromSource,
} from "@app/lib/api/frames/call_frame_function";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import {
  FrameFunctionCallFromSourceRequestSchema,
  frameFunctionCallApiError,
} from "./call_utils";

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameFunctionCallFromSourceRequestSchema),
  async (ctx): HandlerResult<CallFrameFunctionResult> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot call Frame functions.",
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

    const result = await callFrameFunctionFromSource(auth, {
      conversation: conversation.toJSON(),
      ...ctx.req.valid("json"),
    });
    if (result.isErr()) {
      const error = frameFunctionCallApiError(result.error);
      return apiError(
        ctx,
        {
          status_code: error.statusCode,
          api_error: {
            type: error.type,
            message: error.message,
          },
        },
        result.error
      );
    }

    return ctx.json(result.value, 200);
  }
);

export default app;
