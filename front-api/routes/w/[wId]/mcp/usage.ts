import { Hono } from "hono";

import type { MCPServersUsageByAgent } from "@app/lib/api/agent_actions";
import { getToolsUsage } from "@app/lib/api/agent_actions";

export type GetMCPServersUsageResponseBody = {
  usage: MCPServersUsageByAgent;
};

// Mounted at /api/w/:wId/mcp/usage.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const usage = await getToolsUsage(auth);
  return c.json({ usage });
});

export default app;
