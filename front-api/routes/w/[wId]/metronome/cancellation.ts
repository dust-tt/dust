import {
  cancelWorkspaceSubscription,
  resumeWorkspaceSubscription,
  type SubscriptionCancellationError,
} from "@app/lib/api/billing/subscription_cancellation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const PatchCancellationRequestBody = z.object({
  // `cancel`: churn out at the current period end.
  // `resume`: undo a previously scheduled cancellation.
  action: z.enum(["cancel", "resume"]),
});

type PatchCancellationResponseBody = {
  success: boolean;
};

function cancellationErrorToApi(
  ctx: Context,
  err: SubscriptionCancellationError
) {
  return apiError(ctx, {
    status_code: err.kind === "invalid_state" ? 400 : 502,
    api_error: {
      type:
        err.kind === "invalid_state"
          ? "subscription_state_invalid"
          : "internal_server_error",
      message: err.message,
    },
  });
}

// Mounted at /api/w/:wId/metronome/cancellation.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("json", PatchCancellationRequestBody),
  ensureHasWorkspacePermission(
    "admin",
    "billing",
    "You need billing access to manage billing settings, invoices, and payment methods."
  ),
  async (ctx): HandlerResult<PatchCancellationResponseBody> => {
    const auth = ctx.get("auth");

    const { action } = ctx.req.valid("json");

    const result =
      action === "cancel"
        ? await cancelWorkspaceSubscription(auth)
        : await resumeWorkspaceSubscription(auth);
    if (result.isErr()) {
      return cancellationErrorToApi(ctx, result.error);
    }
    return ctx.json({ success: true });
  }
);

export default app;
