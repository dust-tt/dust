import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/skills.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });
  if (!agent) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const skills = await SkillResource.listByAgentConfiguration(auth, agent);
  return c.json({ skills: skills.map((s) => s.toJSON(auth)) });
});

export default app;
