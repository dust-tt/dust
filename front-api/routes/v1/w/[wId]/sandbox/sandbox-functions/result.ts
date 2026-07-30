import { isSandboxFunctionInvocationTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { normalizeSandboxFunctionResult } from "@app/lib/api/sandbox_functions/result_envelope";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import logger from "@app/logger/logger";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const PostSandboxFunctionResultRequestBodySchema = z
  .object({
    function: z.string().optional(),
    result: z.unknown(),
  })
  .strict();

// Mounted at /api/v1/w/:wId/sandbox/sandbox-functions/result. sandboxAuth is
// applied by the parent sandbox sub-app, so ctx.get("auth") and
// ctx.get("sandboxClaims") are always available here.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", PostSandboxFunctionResultRequestBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const sandboxClaims = ctx.get("sandboxClaims");
    const { function: functionName, result } = ctx.req.valid("json");

    void auth;
    void functionName;

    if (!isSandboxFunctionInvocationTokenPayload(sandboxClaims)) {
      return ctx.json({ success: true });
    }

    const sandboxFunction = await SandboxFunctionResource.fetchById(
      auth,
      sandboxClaims.sandboxFunctionId
    );
    if (!sandboxFunction) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox function not found.",
        },
      });
    }

    const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
      sandboxFunction,
      invocationId: sandboxClaims.invocationId,
    });
    if (!invocation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox function invocation not found.",
        },
      });
    }

    const normalized = normalizeSandboxFunctionResult(result);
    if (normalized.timingsMs) {
      logger.info(
        {
          invocationId: invocation.sId,
          functionId: sandboxFunction.sId,
          timingsMs: normalized.timingsMs,
        },
        "Pod function result timings"
      );
    }

    if (normalized.ok) {
      await invocation.succeed(normalized.output);
    } else {
      await invocation.fail(normalized.error);
    }

    return ctx.json({ success: true });
  }
);

export default app;
