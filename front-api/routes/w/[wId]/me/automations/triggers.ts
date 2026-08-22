import { UserAutomationTriggersBodySchema } from "@app/lib/api/analytics/automations/schema";
import type { UserAutomationTriggers } from "@app/lib/api/analytics/automations/user_triggers";
import { fetchUserAutomationTriggers } from "@app/lib/api/analytics/automations/user_triggers";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type GetUserAutomationTriggersResponse = UserAutomationTriggers;

// Mounted at /api/w/:wId/me/automations/triggers.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", UserAutomationTriggersBodySchema),
  async (ctx): HandlerResult<GetUserAutomationTriggersResponse> => {
    const auth = ctx.get("auth");
    const { limit, offset, search, filter, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const triggers = await fetchUserAutomationTriggers(auth, {
      period,
      limit,
      offset,
      search,
      filter,
    });

    return ctx.json(triggers);
  }
);

export default app;
