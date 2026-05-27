import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetReinforcementDailySpendResponseBody = {
  // ISO date strings ("YYYY-MM-DD") → spend in microUSD for that day.
  dailySpendMicroUsd: Record<string, number>;
  periodStartDate: string;
  periodEndDate: string;
};

// Mounted at /api/w/:wId/skills/reinforcement_daily_spend.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetReinforcementDailySpendResponseBody> => {
    const auth = ctx.get("auth");

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

    return ctx.json({
      dailySpendMicroUsd,
      periodStartDate: period.cycleStart.toISOString(),
      periodEndDate: period.cycleEnd.toISOString(),
    });
  }
);

export default app;
