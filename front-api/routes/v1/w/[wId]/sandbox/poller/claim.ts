import { isSandboxPollerTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { claimPollerJob } from "@app/lib/api/sandbox_functions/poller_channel";
import type { SandboxFunctionPollerJob } from "@app/types/api/sandbox_functions";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostPollerClaimRequestBodySchema = z
  .object({
    invocationId: z.string().min(1),
  })
  .strict();

// The job only comes back to the claim winner. Publishing it on the work channel instead would
// leave the invocation's credential and the caller's input sitting in a replayable stream.
type PostPollerClaimResponseBody =
  | { granted: true; job: SandboxFunctionPollerJob }
  | { granted: false };

// Mounted at /api/v1/w/:wId/sandbox/poller/claim. sandboxAuth is applied by the parent poller
// sub-app, so ctx.get("sandboxClaims") is always a poller token here.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", PostPollerClaimRequestBodySchema),
  async (ctx): HandlerResult<PostPollerClaimResponseBody> => {
    const sandboxClaims = ctx.get("sandboxClaims");
    const { invocationId } = ctx.req.valid("json");

    if (!isSandboxPollerTokenPayload(sandboxClaims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This endpoint requires a Pod function poller token.",
        },
      });
    }

    const job = await claimPollerJob({
      invocationId,
      sandboxId: sandboxClaims.sbId,
    });
    if (!job) {
      return ctx.json({ granted: false });
    }

    return ctx.json({ granted: true, job });
  }
);

export default app;
