import { updateAgentConfigurationsModel } from "@app/lib/api/assistant/configuration/model_update";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import type { BatchUpdateAgentModelResponseBody } from "@app/types/api/assistant/configuration";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const BatchUpdateAgentModelRequestBodySchema = z.object({
  agentIds: z.array(z.string()),
  modelId: z.string(),
  // Both default to what picking that model in the agent builder would do: the model's own
  // default reasoning effort, and the agent's existing response format.
  reasoningEffort: z.enum(ORDERED_REASONING_EFFORTS).optional(),
  responseFormat: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/batch_update_model.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", BatchUpdateAgentModelRequestBodySchema),
  async (ctx): HandlerResult<BatchUpdateAgentModelResponseBody> => {
    const auth = ctx.get("auth");

    const isSaveAgentConfigurationsEnabled =
      await KillSwitchResource.isKillSwitchEnabled("save_agent_configurations");
    if (isSaveAgentConfigurationsEnabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving agent configurations is temporarily disabled, try again later.",
        },
      });
    }

    const { agentIds, modelId, reasoningEffort, responseFormat } =
      ctx.req.valid("json");

    // Not atomic: each agent is saved as a new version on its own, and the ones that could not
    // be updated are reported back as skipped.
    const result = await updateAgentConfigurationsModel(auth, {
      agentIds,
      modelId,
      reasoningEffort,
      responseFormat,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    const { updatedAgentIds, skippedAgentIds } = result.value;

    return ctx.json({
      success: true as const,
      updatedAgentIds,
      skippedAgentIds,
    });
  }
);

export default app;
