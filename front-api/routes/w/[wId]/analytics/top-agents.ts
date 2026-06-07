import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { GetWorkspaceTopAgentsResponse } from "@app/lib/api/workspace/analytics";
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

type TopAgentsAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<{
    key: string;
    doc_count: number;
    unique_users?: estypes.AggregationsCardinalityAggregate;
  }>;
};

type TopAgentBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

// Mounted at /api/w/:wId/analytics/top-agents.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, limit } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const result = await searchAnalytics<never, TopAgentsAggs>(
    {
      bool: {
        filter: [baseQuery, { exists: { field: "agent_id" } }],
      },
    },
    {
      aggregations: {
        by_agent: {
          terms: {
            field: "agent_id",
            size: limit,
          },
          aggs: {
            unique_users: {
              cardinality: {
                field: "user_id",
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
        message: `Failed to retrieve top agents: ${fromError(result.error).toString()}`,
      },
    });
  }

  const buckets = bucketsToArray<TopAgentBucket>(
    result.value.aggregations?.by_agent?.buckets
  );

  const agentIds = buckets.map((bucket) => String(bucket.key));
  const agents =
    agentIds.length > 0
      ? await getAgentConfigurations(auth, {
          agentIds,
          variant: "extra_light",
        })
      : [];
  const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));

  const rows = buckets.map((bucket) => {
    const agentId = String(bucket.key);
    const agent = agentsById.get(agentId);
    return {
      agentId,
      name: agent?.name ?? "Unknown agent",
      pictureUrl: agent?.pictureUrl ?? null,
      messageCount: bucket.doc_count ?? 0,
      userCount: Math.round(bucket.unique_users?.value ?? 0),
    };
  });

  const body: GetWorkspaceTopAgentsResponse = { agents: rows };
  return ctx.json(body);
});

export default app;
