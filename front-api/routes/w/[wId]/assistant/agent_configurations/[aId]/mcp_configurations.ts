import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMcpConfigurationSummary } from "@app/lib/api/assistant/mcp_configurations";
import { listAgentMcpConfigurationsForAgent } from "@app/lib/api/assistant/mcp_configurations";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetAgentMcpConfigurationsResponseBody = {
  configurations: AgentMcpConfigurationSummary[];
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/mcp_configurations.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetAgentMcpConfigurationsResponseBody> => {
    const auth = ctx.get("auth");
    const aId = ctx.req.param("aId") ?? "";

    const assistant = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    const owner = auth.workspace();
    if (!owner) {
      return apiError(ctx, {
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

    return ctx.json({ configurations });
  }
);

export default app;
