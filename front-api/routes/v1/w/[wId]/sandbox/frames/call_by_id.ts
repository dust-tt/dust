import {
  type CallFrameFunctionResult,
  callFrameFunction,
} from "@app/lib/api/frames/call_frame_function";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import {
  FrameFunctionCallRequestSchema,
  frameFunctionCallApiError,
} from "./call_utils";

const FrameCallParamsSchema = z.object({
  frameId: z.string().refine((value) => isResourceSId("file", value)),
});

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("param", FrameCallParamsSchema),
  validate("json", FrameFunctionCallRequestSchema),
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

    const result = await callFrameFunction(auth, {
      frameId: ctx.req.valid("param").frameId,
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
