import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";
import { workspaceApp } from "@front-api/middleware/env";

export type GetTrialMessageUsageResponseType = {
  count: number;
  limit: number;
};

// Mounted at /api/w/:wId/trial-message-usage.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const usage = await getMessageUsageCount(auth);
  const body: GetTrialMessageUsageResponseType = usage;
  return ctx.json(body);
});

export default app;
