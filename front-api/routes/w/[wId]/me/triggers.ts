import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { TriggerType } from "@app/types/assistant/triggers";
import { removeNulls } from "@app/types/shared/utils/general";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetUserTriggersResponseBody = {
  triggers: (TriggerType & {
    isEditor: boolean;
    agentName: string;
    agentPictureUrl: string;
  })[];
};

// Mounted at /api/w/:wId/me/triggers.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetUserTriggersResponseBody> => {
  const auth = ctx.get("auth");

  const editorTriggers = await TriggerResource.listByUserEditor(
    auth,
    auth.getNonNullableUser()
  );

  const uniqueAgentIds = Array.from(
    new Set(editorTriggers.map((t) => t.agentConfigurationId))
  );

  const agentConfigurations = await getAgentConfigurations(auth, {
    agentIds: uniqueAgentIds,
    variant: "light",
  });

  const agentById = new Map(agentConfigurations.map((a) => [a.sId, a]));

  const triggers = removeNulls(
    editorTriggers.map((trigger) => {
      const agent = agentById.get(trigger.agentConfigurationId);
      if (!agent) {
        return null;
      }
      return {
        ...trigger.toJSON(),
        isEditor: true,
        agentName: agent.name,
        agentPictureUrl: agent.pictureUrl,
      };
    })
  );

  return ctx.json({ triggers });
});

export default app;
