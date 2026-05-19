import { Hono } from "hono";

import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

export type GetTrialMessageUsageResponseType = {
  count: number;
  limit: number;
};

// Mounted at /api/w/:wId/trial-message-usage.
const app = new Hono();

app.use("*", workspaceAuth({ doesNotRequireCanUseProduct: true }));

app.get("/", async (c) => {
  const auth = c.get("auth");
  const usage = await getMessageUsageCount(auth);
  const body: GetTrialMessageUsageResponseType = usage;
  return c.json(body);
});

export default app;
