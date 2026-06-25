import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import type { GetReinforcementDailySpendResponseBody } from "@app/types/api/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/skills/reinforcement_daily_spend.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetReinforcementDailySpendResponseBody> => {
    const auth = ctx.get("auth");

    const period = await getCurrentPeriod(auth);

    const dailyMap =
      await SelfImprovingSkillsUsageResource.getDailySpendWithMarkup(auth, {
        startDate: period.cycleStart,
        endDate: period.cycleEnd,
      });

    const dailySpendMicroUsd: Record<string, number> = {};
    const dailySpendAwuCredits: Record<string, number> = {};
    for (const [day, spend] of dailyMap) {
      dailySpendMicroUsd[day] = spend.priceMicroUsd;
      dailySpendAwuCredits[day] = spend.priceAwuCredits;
    }

    return ctx.json({
      dailySpendMicroUsd,
      dailySpendAwuCredits,
      periodStartDate: period.cycleStart.toISOString(),
      periodEndDate: period.cycleEnd.toISOString(),
    });
  }
);

export default app;
