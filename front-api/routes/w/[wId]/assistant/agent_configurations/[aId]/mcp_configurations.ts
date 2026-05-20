import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { listAgentMcpConfigurationsForAgent } from "@app/lib/api/assistant/mcp_configurations";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/mcp_configurations.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  const configurations = await listAgentMcpConfigurationsForAgent({
    workspaceId: owner.id,
    agentConfigurationId: aId,
  });

  return c.json({ configurations });
});

export default app;
