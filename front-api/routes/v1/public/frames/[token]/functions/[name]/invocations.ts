import {
  invokePublicFrameFunction,
  resolvePublicFrameFunction,
  resolvePublicFrameShare,
  sanitizePublicCallError,
} from "@app/lib/api/frames/public_functions";
import { isSandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import type { PostPublicFrameFunctionInvocationResponseBody } from "@app/types/api/sandbox_functions";
import { PostFrameFunctionInvocationBodySchema } from "@front-api/lib/api/frame_function_invocation_schemas";
import { getSandboxFunctionInvocationErrorStatusCode } from "@front-api/lib/api/sandbox_function_invocation_errors";
import { bodyLimit } from "@front-api/middlewares/body_limit";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PUBLIC_FRAME_FUNCTION_BODY_MAX_SIZE_BYTES = 1024 * 1024;

const ParamsSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
});

// Mounted at /api/v1/public/frames/:token/functions/:name/invocations.
const app = unauthedApp();

/** @ignoreswagger */
app.post(
  "/",
  bodyLimit(PUBLIC_FRAME_FUNCTION_BODY_MAX_SIZE_BYTES),
  validate("param", ParamsSchema),
  validate("json", PostFrameFunctionInvocationBodySchema),
  async (ctx): HandlerResult<PostPublicFrameFunctionInvocationResponseBody> => {
    const { token, name } = ctx.req.valid("param");

    const share = await resolvePublicFrameShare(token);
    if (!share) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Frame function not found.",
        },
      });
    }

    const sandboxFunction = await resolvePublicFrameFunction(share, name);
    if (!sandboxFunction) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Frame function not found.",
        },
      });
    }

    const result = await invokePublicFrameFunction(share, {
      sandboxFunction,
      body: ctx.req.valid("json"),
    });
    if (result.isErr()) {
      if (isSandboxFunctionInvocationError(result.error)) {
        const { message } = sanitizePublicCallError({
          code: result.error.code,
          message: result.error.message,
        });
        return apiError(ctx, {
          status_code: getSandboxFunctionInvocationErrorStatusCode(
            result.error.code
          ),
          api_error: {
            type: result.error.code,
            message,
          },
        });
      }
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Frame function invocation failed.",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value, 201);
  }
);

export default app;
