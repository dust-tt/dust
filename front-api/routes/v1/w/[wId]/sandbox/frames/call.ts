import {
  type CallFrameFunctionFromSourceResult,
  callFrameFunctionFromSource,
  type FrameFunctionCallFromSourceError,
  FrameFunctionExecutionError,
} from "@app/lib/api/frames/call_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import {
  type DustFileSystemError,
  isDustFileSystemError,
} from "@app/types/file_system";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { getSandboxFunctionInvocationErrorStatusCode } from "@front-api/lib/api/sandbox_function_invocation_errors";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameCallRequestSchema = z.object({
  sourcePath: z.string().min(1),
  functionName: z.string().refine(isValidSandboxFunctionSlug),
  input: z.unknown().optional(),
});

function frameCallErrorStatus(
  error: FrameFunctionCallFromSourceError
): 400 | 403 | 404 | 500 {
  switch (error.code) {
    case "invalid_source":
      return 400;
    case "unauthorized":
      return 403;
    case "frame_not_found":
    case "function_not_found":
      return 404;
    default:
      return assertNever(error.code);
  }
}

function fileSystemErrorStatus(error: DustFileSystemError): 400 | 403 | 500 {
  if (error.code === "unauthorized") {
    return 403;
  }
  return error.code === "internal" ? 500 : 400;
}

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameCallRequestSchema),
  async (ctx): HandlerResult<CallFrameFunctionFromSourceResult> => {
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
      if (result.error instanceof FrameFunctionExecutionError) {
        const { callError } = result.error;
        if (
          callError.code === "user_authentication_required" ||
          callError.code === "frame_runtime_unavailable"
        ) {
          return apiError(ctx, {
            status_code: getSandboxFunctionInvocationErrorStatusCode(
              callError.code
            ),
            api_error: {
              type: callError.code,
              message: callError.message,
            },
          });
        }
        const status =
          callError.code === "invocation_failed" ||
          callError.code === "transport_error"
            ? 500
            : 400;
        return apiError(
          ctx,
          {
            status_code: status,
            api_error: {
              type:
                status === 500
                  ? "internal_server_error"
                  : "invalid_request_error",
              message: `Frame function "${result.error.functionName}" returned an error (${callError.code}): ${callError.message}`,
            },
          },
          result.error
        );
      }

      const status = isDustFileSystemError(result.error)
        ? fileSystemErrorStatus(result.error)
        : frameCallErrorStatus(result.error);
      return apiError(
        ctx,
        {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: result.error.message,
          },
        },
        result.error
      );
    }

    return ctx.json(result.value, 200);
  }
);

export default app;
