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
          type: "suggestion_batch_already_reviewed",
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
          case "skill_change_not_authorized":
          case "skill_instructions_reference_unavailable":
          case "tag_change_not_allowed":
            return apiError(ctx, {
              status_code: 403,
              api_error: { type: code, message },
            });
          case "agent_configuration_not_found":
          case "file_not_found":
          case "mcp_server_view_not_found":
          case "skill_not_found":
          case "user_not_found":
            return apiError(ctx, {
              status_code: 404,
              api_error: { type: code, message },
            });
          case "user_not_member":
            return apiError(ctx, {
              status_code: 404,
              api_error: { type: "workspace_user_not_found", message },
            });
          case "agent_already_created":
          case "agent_suggestion_not_applicable":
          case "skill_already_created":
          case "skill_already_exists":
          case "skill_file_already_exists":
          case "skill_suggestion_outdated":
          case "tag_already_on_agent":
          case "user_already_agent_editor":
            return apiError(ctx, {
              status_code: 409,
              api_error: { type: code, message },
            });
          case "file_too_large":
            return apiError(ctx, {
              status_code: 413,
              api_error: { type: code, message },
            });
          case "assistant_saving_error":
            return apiError(ctx, {
              status_code: 500,
              api_error: { type: code, message },
            });
          case "internal_error":
            return apiError(ctx, {
              status_code: 500,
              api_error: { type: "internal_server_error", message },
            });
          case "active_custom_agent_required":
          case "agent_editor_required":
          case "agent_suggestion_not_supported":
          case "conflicting_suggestions":
          case "editor_not_workspace_member":
          case "file_is_empty":
          case "file_type_not_supported":
          case "invalid_request_error":
          case "invalid_response_format":
          case "model_not_available":
          case "reasoning_effort_not_supported":
          case "skill_archived":
          case "skill_editors_missing_space_access":
          case "skill_file_not_attached":
          case "skill_last_editor_removed":
          case "skill_name_empty":
          case "skill_name_too_long":
          case "skill_not_active":
          case "skill_suggestion_invalid":
          case "structured_output_not_supported":
          case "tag_not_on_agent":
          case "user_not_agent_editor":
            return apiError(ctx, {
              status_code: 400,
              api_error: { type: code, message },
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
