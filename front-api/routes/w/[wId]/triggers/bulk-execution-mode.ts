import {
  BulkTriggerSelectionSchema,
  resolveBulkTriggerSelection,
} from "@app/lib/api/triggers/bulk_selection";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { BulkTriggerUpdateOutcome } from "@app/types/assistant/triggers";
import { TRIGGER_EXECUTION_MODES } from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const BodySchema = z.object({
  selection: BulkTriggerSelectionSchema,
  executionMode: z.enum(TRIGGER_EXECUTION_MODES),
});

export type BulkTriggerExecutionModeResponseBody = BulkTriggerUpdateOutcome;

// Mounted at /api/w/:wId/triggers/bulk-execution-mode.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  withFeatureFlag("trigger_pool_choice"),
  validate("json", BodySchema),
  async (ctx): HandlerResult<BulkTriggerExecutionModeResponseBody> => {
    const auth = ctx.get("auth");
    const { selection, executionMode } = ctx.req.valid("json");

    const triggersResult = await resolveBulkTriggerSelection(auth, selection);
    if (triggersResult.isErr()) {
      switch (triggersResult.error.code) {
        case "limit_reached":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: triggersResult.error.message,
            },
          });
        case "internal_error":
          return apiError(
            ctx,
            {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to resolve the selected automations.",
              },
            },
            triggersResult.error
          );
        default:
          assertNever(triggersResult.error.code);
      }
    }

    const outcome = await TriggerResource.bulkChangeExecutionMode(
      auth,
      triggersResult.value,
      executionMode
    );

    return ctx.json(outcome);
  }
);

export default app;
