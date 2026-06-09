import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { GetUserTriggersResponseBody } from "@app/lib/api/assistant/configuration/triggers";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/me/triggers.
const app = workspaceApp();

/** @ignoreswagger */
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
