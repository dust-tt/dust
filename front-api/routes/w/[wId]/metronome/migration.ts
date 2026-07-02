import {
  cancelMigratingWorkspaceSubscription,
  type MigrationLifecycleError,
  resumeWorkspaceMigration,
} from "@app/lib/api/billing/migration_lifecycle";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const PatchMigrationRequestBody = z.object({
  // `cancel`: churn out at the current period end instead of migrating.
  // `resume`: re-stage the previously cancelled migration.
  action: z.enum(["cancel", "resume"]),
});

type PatchMigrationResponseBody = {
  success: boolean;
};

function lifecycleErrorToApi(ctx: Context, err: MigrationLifecycleError) {
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

// Mounted at /api/w/:wId/metronome/migration.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchMigrationRequestBody),
  async (ctx): HandlerResult<PatchMigrationResponseBody> => {
    const auth = ctx.get("auth");
    const { action } = ctx.req.valid("json");

    const result =
      action === "cancel"
        ? await cancelMigratingWorkspaceSubscription(auth)
        : await resumeWorkspaceMigration(auth);
    if (result.isErr()) {
      return lifecycleErrorToApi(ctx, result.error);
    }
    return ctx.json({ success: true });
  }
);

export default app;
