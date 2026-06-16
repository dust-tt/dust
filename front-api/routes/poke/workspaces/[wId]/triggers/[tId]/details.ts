import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { PokeGetTriggerDetails } from "@app/lib/api/poke/triggers";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/details.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetTriggerDetails> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");

    const trigger = await TriggerResource.fetchById(auth, tId);
    if (!trigger) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "trigger_not_found",
          message: "Trigger not found.",
        },
      });
    }

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: trigger.agentConfigurationId,
      variant: "full",
    });
    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found.",
        },
      });
    }

    const editorUsers = trigger.editor
      ? await UserResource.fetchByModelIds([trigger.editor])
      : [];
    const editorUser = editorUsers.length > 0 ? editorUsers[0].toJSON() : null;

    return ctx.json({
      trigger: trigger.toJSON(),
      agent: agentConfiguration,
      editorUser,
    });
  }
);

export default app;
