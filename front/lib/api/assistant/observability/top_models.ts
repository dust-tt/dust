import {
  buildAgentAnalyticsBaseQuery,
  MODEL_ID_FIELD,
} from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type TopModelRow = {
  modelId: string;
  name: string;
  providerId: string | null;
  messageCount: number;
  agentCount: number;
  userCount: number;
};

type TopModelBucket = {
  key: string;
  doc_count: number;
  unique_agents?: estypes.AggregationsCardinalityAggregate;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

type TopModelsAggs = {
  by_model?: estypes.AggregationsMultiBucketAggregateBase<TopModelBucket>;
};

// Ranks the models that actually answered messages over a time window, with the
// count of distinct agents and users behind each. Backs the
// workspace_analytics get_top_models tool, which also serves as the discovery
// path for the `modelIds` filter of the other tools. Either `days` or
// `startDate`/`endDate` bounds the window; the source/agent/user/model filters
// are optional.
export async function fetchTopModels(
  auth: Authenticator,
  {
    days,
    startDate,
    endDate,
    limit,
    contextOrigin,
    agentIds,
    userIds,
    agentTagIds,
    modelIds,
  }: {
    days?: number;
    startDate?: string;
    endDate?: string;
    limit: number;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
  }
): Promise<Result<TopModelRow[], ElasticsearchError>> {
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    agentTagIds,
    modelIds,
  });

  const result = await searchAnalytics<never, TopModelsAggs>(
    {
      bool: {
        filter: [baseQuery, { exists: { field: MODEL_ID_FIELD } }],
      },
    },
    {
      aggregations: {
        by_model: {
          terms: { field: MODEL_ID_FIELD, size: limit },
          aggs: {
            unique_agents: { cardinality: { field: "agent_id" } },
            unique_users: { cardinality: { field: "user_id" } },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<TopModelBucket>(
    result.value.aggregations?.by_model?.buckets
  );

  const rows = buckets.map((bucket) => {
    const modelId = String(bucket.key);
    // Models leave the catalog while their messages stay indexed; fall back to
    // the raw id so the row is still readable and filterable.
    const modelConfig = getModelConfigByModelId(modelId);
    return {
      modelId,
      name: modelConfig?.displayName ?? modelId,
      providerId: modelConfig?.providerId ?? null,
      messageCount: bucket.doc_count ?? 0,
      agentCount: Math.round(bucket.unique_agents?.value ?? 0),
      userCount: Math.round(bucket.unique_users?.value ?? 0),
    };
  });

  return new Ok(rows);
}
