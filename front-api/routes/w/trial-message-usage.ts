import { Hono } from "hono";

import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";

export type GetTrialMessageUsageResponseType = {
  count: number;
  limit: number;
};

export const trialMessageUsageApp = new Hono();

trialMessageUsageApp.get("/", async (c) => {
  const auth = c.get("auth");
  const usage = await getMessageUsageCount(auth);
  const body: GetTrialMessageUsageResponseType = usage;
  return c.json(body);
});
