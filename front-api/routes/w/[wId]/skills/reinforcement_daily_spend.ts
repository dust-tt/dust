import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

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
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can view self-improving skills daily spend.",
      },
    });
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
