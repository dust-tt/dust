import { isSandboxFunctionInvocationTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { normalizeSandboxFunctionResult } from "@app/lib/api/sandbox_functions/result_envelope";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
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
//
// DEPRECATED 2026-08-10, pending removal. dsbx 0.1.46 dropped callback delivery:
// every result now comes back on the exec's own stdout, and front has passed
// `--result-delivery stdout` since Pod function stdout delivery became the
// default. The only callers left are dsbx binaries baked into images still
// pinned below 0.1.46 (DSBX_CLI_VERSION in front/lib/api/sandbox/image/registry.ts),
// and only for a hand-run `dsbx function run` that omits the flag. Once that pin
// has moved and no running sandbox predates it, delete this route and its test,
// along with the callback arm normalizeSandboxFunctionResult still accepts in
// lib/api/sandbox_functions/result_envelope.ts.
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

    // Execution-side resolution: a sandbox-token auth cannot carry the invoker's original grant (e.g.
    // a frame share token); the validated claims name the invocation, which is the proof.
    const sandboxFunction = await SandboxFunctionResource.fetchByIdForExecution(
      auth,
      sandboxClaims.sandboxFunctionId,
      { invocationId: sandboxClaims.invocationId }
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
      access: "system",
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
    if (normalized.ok) {
      await invocation.succeed(normalized.output);
    } else {
      await invocation.fail(normalized.error);
    }

    return ctx.json({ success: true });
  }
);

export default app;
