import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

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
  async (ctx): HandlerResult<GetReinforcementDailySpendResponseBody> => {
    const auth = ctx.get("auth");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
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

    return ctx.json({
      dailySpendMicroUsd,
      periodStartDate: period.cycleStart.toISOString(),
      periodEndDate: period.cycleEnd.toISOString(),
    });
  }
);

export default app;
