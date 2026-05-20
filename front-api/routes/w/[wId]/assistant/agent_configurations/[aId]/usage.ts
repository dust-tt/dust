import { getAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/usage.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const aId = ctx.req.param("aId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  const agentUsage = await getAgentUsage(auth, {
    agentConfiguration,
    workspaceId: owner.sId,
  });

  return ctx.json({ agentUsage });
});

export default app;
