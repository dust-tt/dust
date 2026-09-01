import {
  type ConvertLegacyFrameToV2Error,
  type ConvertLegacyFrameToV2Result,
  convertLegacyFrameToV2,
  isFrameV2ConversionError,
} from "@app/lib/api/frames/convert_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { frameSourceErrorStatus } from "./errors";

const FrameConvertRequestSchema = z.object({
  manifestPath: z.string().min(1),
  sourcePath: z.string().min(1),
});

function frameConvertErrorStatus(
  error: ConvertLegacyFrameToV2Error
): 400 | 403 | 500 {
  if (isFrameV2ConversionError(error)) {
    return error.code === "internal" ? 500 : 400;
  }
  return frameSourceErrorStatus(error);
}

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameConvertRequestSchema),
  async (ctx): HandlerResult<ConvertLegacyFrameToV2Result> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot convert Frames.",
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

    const { manifestPath, sourcePath } = ctx.req.valid("json");
    const conversion = await convertLegacyFrameToV2(auth, {
      conversation: conversation.toJSON(),
      manifestPath,
      sourcePath,
    });
    if (conversion.isErr()) {
      const status = frameConvertErrorStatus(conversion.error);
      return apiError(
        ctx,
        {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: conversion.error.message,
          },
        },
        conversion.error
      );
    }

    return ctx.json(conversion.value, 200);
  }
);

export default app;
