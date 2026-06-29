import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const PostSandboxFunctionResultRequestBodySchema = z
  .object({
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
    const { result } = ctx.req.valid("json");

    void auth;
    void sandboxClaims;
    void result;

    // TODO(spolu): Post the result event to the sandbox function invocation stream.

    return ctx.json({ success: true });
  }
);

export default app;
