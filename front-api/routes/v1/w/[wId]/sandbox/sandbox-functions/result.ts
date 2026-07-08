import { isSandboxFunctionInvocationTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
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

    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_result",
        created: Date.now(),
        invocationId: sandboxClaims.invocationId,
        functionId: sandboxClaims.sandboxFunctionId,
        result,
      },
      { invocationId: sandboxClaims.invocationId }
    );

    return ctx.json({ success: true });
  }
);

export default app;
