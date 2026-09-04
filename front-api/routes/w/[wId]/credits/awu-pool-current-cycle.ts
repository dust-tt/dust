import { getAwuPoolCurrentCycle } from "@app/lib/api/credits/awu_pool_summary";
import type { AwuPoolCurrentCycleResponseBody } from "@app/types/api/credits/awu_pool_summary";
import { awuPoolSummaryErrorToApi } from "@front-api/lib/api/awu_pool_summary_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/awu-pool-current-cycle.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  async (ctx): HandlerResult<AwuPoolCurrentCycleResponseBody> => {
    const auth = ctx.get("auth");

    const result = await getAwuPoolCurrentCycle(auth);
    if (result.isErr()) {
      return awuPoolSummaryErrorToApi(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

export default app;
