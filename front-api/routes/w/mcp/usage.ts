import { Hono } from "hono";

import type { MCPServersUsageByAgent } from "@app/lib/api/agent_actions";
import { getToolsUsage } from "@app/lib/api/agent_actions";

export type GetMCPServersUsageResponseBody = {
  usage: MCPServersUsageByAgent;
};

// Mounted under /api/w/:wId/mcp/usage.
export const usageApp = new Hono();

usageApp.get("/", async (c) => {
  const auth = c.get("auth");
  const usage = await getToolsUsage(auth);
  return c.json({ usage });
});
