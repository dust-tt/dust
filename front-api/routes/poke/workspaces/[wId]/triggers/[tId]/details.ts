import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { UserType } from "@app/types/user";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeGetTriggerDetails = {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  editorUser: UserType | null;
};

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/details.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const tId = ctx.req.param("tId");
  if (!tId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
      },
    });
  }

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

  const body: PokeGetTriggerDetails = {
    trigger: trigger.toJSON(),
    agent: agentConfiguration,
    editorUser,
  };
  return ctx.json(body);
});

export default app;
