import {
  AwuPoolSummaryQuerySchema,
  getAwuPoolCycleHistory,
} from "@app/lib/api/credits/awu_pool_summary";
import type { AwuPoolCycleHistoryResponseBody } from "@app/types/api/credits/awu_pool_summary";
import { awuPoolSummaryErrorToApi } from "@front-api/lib/api/awu_pool_summary_errors";
import { pokeApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";

export type { AwuPoolCycleHistoryResponseBody };

// Mounted at /api/poke/workspaces/:wId/credits/awu-pool-cycle-history.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", validate("query", AwuPoolSummaryQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cycleHistoryLimit } = ctx.req.valid("query");

  const result = await getAwuPoolCycleHistory(auth, { cycleHistoryLimit });
  if (result.isErr()) {
    return awuPoolSummaryErrorToApi(ctx, result.error);
  }

  return ctx.json(result.value);
});

export default app;
