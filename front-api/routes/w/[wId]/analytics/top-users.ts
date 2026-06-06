import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { GetWorkspaceTopUsersResponse } from "@app/lib/api/analytics/workspace_analytics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import { UserResource } from "@app/lib/resources/user_resource";
import type { estypes } from "@elastic/elasticsearch";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(100).optional().default(25),
});

type TopUsersAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<{
    key: string;
    doc_count: number;
    unique_agents?: estypes.AggregationsCardinalityAggregate;
  }>;
};

type TopUserBucket = {
  key: string;
  doc_count: number;
  unique_agents?: estypes.AggregationsCardinalityAggregate;
};

function getUserDisplayName(user: UserResource | undefined): string {
  if (!user) {
    return "Programmatic usage";
  }
  const fullName = user.fullName();
  if (fullName) {
    return fullName;
  }
  if (user.username) {
    return user.username;
  }
  return user.email || "Programmatic usage";
}

// Mounted at /api/w/:wId/analytics/top-users.
const app = workspaceApp();

app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, limit } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const result = await searchAnalytics<never, TopUsersAggs>(
    {
      bool: {
        filter: [baseQuery, { exists: { field: "user_id" } }],
      },
    },
    {
      aggregations: {
        by_user: {
          terms: {
            field: "user_id",
            size: limit,
          },
          aggs: {
            unique_agents: {
              cardinality: {
                field: "agent_id",
              },
            },
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
        message: `Failed to retrieve top users: ${fromError(result.error).toString()}`,
      },
    });
  }

  const buckets = bucketsToArray<TopUserBucket>(
    result.value.aggregations?.by_user?.buckets
  );

  const userIds = buckets.map((bucket) => String(bucket.key));
  const users =
    userIds.length > 0 ? await UserResource.fetchByIds(userIds) : [];
  const usersById = new Map(users.map((user) => [user.sId, user]));

  const rows = buckets.map((bucket) => {
    const userId = String(bucket.key);
    const user = usersById.get(userId);
    return {
      userId,
      name: getUserDisplayName(user),
      imageUrl: user?.imageUrl ?? null,
      messageCount: bucket.doc_count ?? 0,
      agentCount: Math.round(bucket.unique_agents?.value ?? 0),
    };
  });

  const body: GetWorkspaceTopUsersResponse = { users: rows };
  return ctx.json(body);
});

export default app;
