import type { AnalystScope } from "@app/lib/api/analytics/analyst/scope";
import { analystQuery } from "@app/lib/api/analytics/analyst/scope";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import { CONSUMPTION_DIMENSION_FIELDS } from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { WithAuth } from "@app/types/shared/typescipt_utils";
import type { estypes } from "@elastic/elasticsearch";

// `skill` and `tool` are the consumption index's invocation-unit dimensions:
// one document is one tool call, so a plain terms agg's `doc_count` is the
// execution count directly — no cardinality needed, unlike the message-unit
// dimensions (agent, user, model).
type InvocationBucket = {
  key: string;
  doc_count: number;
};

type TopInvocationsAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<InvocationBucket>;
};

interface FetchTopInvocationsParams {
  scope: AnalystScope;
  field: string;
  limit: number;
}

async function fetchTopInvocations({
  auth,
  scope,
  field,
  limit,
}: WithAuth<FetchTopInvocationsParams>): Promise<
  Result<InvocationBucket[], ElasticsearchError>
> {
  const result = await searchConsumptionAnalytics<never, TopInvocationsAggs>(
    analystQuery({ auth, scope, extra: [{ exists: { field } }] }),
    {
      aggregations: {
        by_group: {
          terms: { field, size: limit, order: { _count: "desc" } },
        },
      },
      size: 0,
    }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok(
    bucketsToArray<InvocationBucket>(
      result.value.aggregations?.by_group?.buckets
    )
  );
}

export type AnalystTopSkillRow = {
  skillId: string;
  skillName: string;
  totalExecutions: number;
};

export interface FetchAnalystTopSkillsParams {
  scope: AnalystScope;
  limit: number;
}

// A tool call attributed to several skills at once counts once per skill
// (`tool.attributed_skill_ids` is multi-valued), matching how the consumption
// analytics page already treats `skill` as an invocation-unit dimension.
export async function fetchAnalystTopSkills({
  auth,
  scope,
  limit,
}: WithAuth<FetchAnalystTopSkillsParams>): Promise<
  Result<AnalystTopSkillRow[], ElasticsearchError>
> {
  const result = await fetchTopInvocations({
    auth,
    scope,
    field: CONSUMPTION_DIMENSION_FIELDS.skill,
    limit,
  });
  if (result.isErr()) {
    return result;
  }

  const keys = result.value.map((bucket) => String(bucket.key));
  const labels = await resolveDimensionLabels(auth, "skill", keys);

  return new Ok(
    result.value.map((bucket) => {
      const key = String(bucket.key);
      return {
        skillId: key,
        skillName: labels.get(key)?.name ?? key,
        totalExecutions: bucket.doc_count,
      };
    })
  );
}

export type AnalystTopToolRow = {
  serverName: string;
  displayName: string;
  totalExecutions: number;
};

export interface FetchAnalystTopToolsParams {
  scope: AnalystScope;
  limit: number;
}

export async function fetchAnalystTopTools({
  auth,
  scope,
  limit,
}: WithAuth<FetchAnalystTopToolsParams>): Promise<
  Result<AnalystTopToolRow[], ElasticsearchError>
> {
  const result = await fetchTopInvocations({
    auth,
    scope,
    field: CONSUMPTION_DIMENSION_FIELDS.tool,
    limit,
  });
  if (result.isErr()) {
    return result;
  }

  const keys = result.value.map((bucket) => String(bucket.key));
  const labels = await resolveDimensionLabels(auth, "tool", keys);

  return new Ok(
    result.value.map((bucket) => {
      const key = String(bucket.key);
      return {
        serverName: key,
        displayName: labels.get(key)?.name ?? key,
        totalExecutions: bucket.doc_count,
      };
    })
  );
}
