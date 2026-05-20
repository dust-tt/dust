import type { MCPServersUsageByAgent } from "@app/lib/api/agent_actions";
import { getToolsUsage } from "@app/lib/api/agent_actions";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetMCPServersUsageResponseBody = {
  usage: MCPServersUsageByAgent;
};

// Mounted at /api/w/:wId/mcp/usage.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetMCPServersUsageResponseBody> => {
  const auth = ctx.get("auth");
  const usage = await getToolsUsage(auth);
  return ctx.json({ usage });
});

export default app;
