import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { GetWorkspaceAnalyticsOverviewResponse } from "@app/lib/api/workspace/analytics";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { estypes } from "@elastic/elasticsearch";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

type OverviewAggs = {
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

// Mounted at /api/w/:wId/analytics/overview.
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

    const totalMembers =
      await MembershipResource.countActiveMembersForWorkspace({
        workspace: owner,
      });

    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      days,
    });

    const result = await searchAnalytics<never, OverviewAggs>(
      {
        bool: {
          filter: [baseQuery, { exists: { field: "user_id" } }],
        },
      },
      {
        aggregations: {
          unique_users: {
            cardinality: {
              field: "user_id",
            },
          },
        },
        size: 0,
      }
    );

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve analytics overview: ${fromError(result.error).toString()}`,
        },
      });
    }

    const activeUsers = Math.round(
      result.value.aggregations?.unique_users?.value ?? 0
    );

    const body: GetWorkspaceAnalyticsOverviewResponse = {
      totalMembers,
      activeUsers,
    };
    return ctx.json(body);
  }
);

export default app;
