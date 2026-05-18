import { Hono } from "hono";

import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";

export type GetReinforcementDailySpendResponseBody = {
  // ISO date strings ("YYYY-MM-DD") → spend in microUSD for that day.
  dailySpendMicroUsd: Record<string, number>;
  periodStartDate: string;
  periodEndDate: string;
};

// Mounted at /api/w/:wId/skills/reinforcement_daily_spend.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message: "Only admins can view self-improving skills daily spend.",
        },
      },
      403
    );
  }

  const period = await getCurrentPeriod(auth);

  const dailyMap =
    await SelfImprovingSkillsUsageResource.getDailySpendMicroUsdWithMarkup(
      auth,
      {
        startDate: period.cycleStart,
        endDate: period.cycleEnd,
      }
    );

  const dailySpendMicroUsd: Record<string, number> = {};
  for (const [day, spend] of dailyMap) {
    dailySpendMicroUsd[day] = spend;
  }

  return c.json({
    dailySpendMicroUsd,
    periodStartDate: period.cycleStart.toISOString(),
    periodEndDate: period.cycleEnd.toISOString(),
  });
});

export default app;
