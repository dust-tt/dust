import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetWorkspaceContextOriginResponse } from "@app/lib/api/assistant/observability/context_origin";
import { fetchContextOriginBreakdown } from "@app/lib/api/assistant/observability/context_origin";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/source.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasPermission("workspace:view_analytics"),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { days } = ctx.req.valid("query");
    const owner = auth.getNonNullableWorkspace();

    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      days,
    });

    const result = await fetchContextOriginBreakdown(baseQuery);

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve source breakdown: ${fromError(result.error).toString()}`,
        },
      });
    }

    const buckets = result.value;
    const total = buckets.reduce((acc, b) => acc + b.count, 0);

    const body: GetWorkspaceContextOriginResponse = { total, buckets };
    return ctx.json(body);
  }
);

export default app;
