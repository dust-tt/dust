import type { MCPServersUsageByAgent } from "@app/lib/api/agent_actions";
import { getToolsUsage } from "@app/lib/api/agent_actions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetMCPServersUsageResponseBody = {
  usage: MCPServersUsageByAgent;
};

// Mounted at /api/w/:wId/mcp/usage.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetMCPServersUsageResponseBody> => {
  const auth = ctx.get("auth");
  const usage = await getToolsUsage(auth);
  return ctx.json({ usage });
});

export default app;
