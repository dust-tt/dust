import {
  AwuPoolSummaryQuerySchema,
  getAwuPoolSummary,
} from "@app/lib/api/credits/awu_pool_summary";
import type { AwuPoolSummaryResponseBody } from "@app/types/api/credits/awu_pool_summary";
import { awuPoolSummaryErrorToApi } from "@front-api/lib/api/awu_pool_summary_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/credits/awu-pool-summary.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("query", AwuPoolSummaryQuerySchema),
  async (ctx): HandlerResult<AwuPoolSummaryResponseBody> => {
    const auth = ctx.get("auth");
    const { cycleHistoryLimit } = ctx.req.valid("query");

    const result = await getAwuPoolSummary(auth, { cycleHistoryLimit });
    if (result.isErr()) {
      return awuPoolSummaryErrorToApi(ctx, result.error);
    }
    return ctx.json(result.value);
  }
);

export default app;
