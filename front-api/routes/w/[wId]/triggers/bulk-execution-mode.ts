import { BulkTriggerSelectionSchema } from "@app/lib/api/triggers/bulk_selection";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { BulkTriggerUpdateOutcome } from "@app/types/assistant/triggers";
import { TRIGGER_EXECUTION_MODES } from "@app/types/assistant/triggers";
import { resolveBulkTriggerSelectionForRequest } from "@front-api/lib/api/triggers/bulk_selection";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
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

    const triggers = await resolveBulkTriggerSelectionForRequest(
      ctx,
      auth,
      selection
    );
    if (!Array.isArray(triggers)) {
      return triggers;
    }

    const outcome = await TriggerResource.bulkChangeExecutionMode(
      auth,
      triggers,
      executionMode
    );

    return ctx.json(outcome);
  }
);

export default app;
