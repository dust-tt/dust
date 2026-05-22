import {
  getCheckHistoryRuns,
  getRegisteredCheck,
} from "@app/lib/api/poke/production_checks";
import type { CheckHistoryRun } from "@app/types/production_checks";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetCheckHistoryResponseBody = {
  runs: CheckHistoryRun[];
};

// Mounted at /api/poke/production-checks/:checkName/history.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetCheckHistoryResponseBody> => {
  const checkName = ctx.req.param("checkName");
  if (!checkName) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "checkName is required.",
      },
    });
  }

  const registeredCheck = getRegisteredCheck(checkName);
  if (!registeredCheck) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "action_not_found",
        message: `Check "${checkName}" not found.`,
      },
    });
  }

  const runs = await getCheckHistoryRuns(checkName);

  return ctx.json({ runs });
});

export default app;
