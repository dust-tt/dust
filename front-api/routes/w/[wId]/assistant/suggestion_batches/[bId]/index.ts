import { applyBatchSuggestions } from "@app/lib/api/assistant/apply_batch_suggestions";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { PatchSuggestionBatchResponseBody } from "@app/types/api/assistant/suggestion_batches";
import { PatchSuggestionBatchRequestBodySchema } from "@app/types/api/assistant/suggestion_batches";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import assert from "assert";
import { z } from "zod";

const ParamsSchema = z.object({
  bId: z.string(),
});

// Mounted at /api/w/:wId/assistant/suggestion_batches/:bId.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchSuggestionBatchRequestBodySchema),
  async (ctx): HandlerResult<PatchSuggestionBatchResponseBody> => {
    const auth = ctx.get("auth");
    const { bId } = ctx.req.valid("param");
    const { state } = ctx.req.valid("json");

    const batch = await BatchSuggestionResource.fetchById(auth, bId);
    if (!batch) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "batch_suggestion_not_found",
          message: "The suggestion batch was not found.",
        },
      });
    }

    if (batch.state !== "pending") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The suggestion batch has already been reviewed.",
        },
      });
    }

    if (state === "approved") {
      const applyRes = await applyBatchSuggestions(auth, batch);
      if (applyRes.isErr()) {
        const { code, message } = applyRes.error;
        switch (code) {
          case "unauthorized":
            return apiError(ctx, {
              status_code: 403,
              api_error: { type: "agent_group_permission_error", message },
            });
          case "invalid_request_error":
            return apiError(ctx, {
              status_code: 400,
              api_error: { type: "invalid_request_error", message },
            });
          default:
            return assertNever(code);
        }
      }
    }

    await batch.updateState(auth, state);

    // `updateState` does not refresh the members held by `batch`.
    const updatedBatch = await BatchSuggestionResource.fetchById(auth, bId);
    assert(updatedBatch, "The suggestion batch disappeared after its update.");

    return ctx.json({ batch: updatedBatch.toJSONWithSuggestions() });
  }
);

export default app;
