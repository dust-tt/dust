import { getToolsUsage } from "@app/lib/api/agent_actions";
import type { GetMCPServersUsageResponseBody } from "@app/lib/api/mcp";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/mcp/usage.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetMCPServersUsageResponseBody> => {
  const auth = ctx.get("auth");
  const usage = await getToolsUsage(auth);
  return ctx.json({ usage });
});

export default app;
