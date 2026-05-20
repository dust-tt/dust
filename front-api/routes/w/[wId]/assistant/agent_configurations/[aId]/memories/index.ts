import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import mId from "./[mId]";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/memories.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration || !agentConfiguration.canRead) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return ctx.json({ memories: [] });
  }

  const memories = await AgentMemoryResource.findByAgentConfigurationAndUser(
    auth,
    {
      agentConfiguration,
      user: user.toJSON(),
    }
  );

  return ctx.json({ memories: memories.map((memory) => memory.toJSON()) });
});

app.route("/:mId", mId);

export default app;
