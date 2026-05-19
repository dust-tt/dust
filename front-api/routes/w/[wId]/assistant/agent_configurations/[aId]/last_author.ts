import { Hono } from "hono";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { UserResource } from "@app/lib/resources/user_resource";

import { apiError } from "@front-api/middleware/utils";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/last_author.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  if (!agentConfiguration.versionAuthorId) {
    return c.json({ user: null });
  }

  const agentLastAuthor = await UserResource.fetchByModelIds([
    agentConfiguration.versionAuthorId,
  ]);

  return c.json({
    user: agentLastAuthor[0] ? agentLastAuthor[0].toJSON() : null,
  });
});

export default app;
