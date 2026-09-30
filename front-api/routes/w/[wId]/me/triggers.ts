import { AgentResource } from "@app/lib/resources/agent_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { GetUserTriggersResponseBody } from "@app/types/api/assistant/configuration/triggers";
import { removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/me/triggers.
// Deprecated 2026-08-21: the personal automations view moved to
// /api/w/:wId/me/analytics/automations/triggers. Delete once deployed
// clients have cycled out.
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

  const agents = await AgentResource.fetchByIds(auth, uniqueAgentIds);
  const agentById = new Map(agents.map((a) => [a.sId, a]));

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
