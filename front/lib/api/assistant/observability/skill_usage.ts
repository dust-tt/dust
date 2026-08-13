import {
  fetchNestedTermsBuckets,
  fetchNestedUsageMetrics,
} from "@app/lib/api/assistant/observability/nested_usage_metrics";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

const SKILLS_NESTED_PATH = "skills_used";
const SKILLS_NAME_FIELD = "skills_used.skill_name";
const SKILLS_ID_FIELD = "skills_used.skill_id";

export type SkillUsagePoint = {
  timestamp: number;
  date: string;
  uniqueUsers: number;
  executionCount: number;
};

export type AvailableSkill = {
  skillName: string;
  totalExecutions: number;
};

type AvailableSkillById = {
  skillId: string;
  totalExecutions: number;
};

export type GetWorkspaceSkillsResponse = {
  skills: AvailableSkill[];
};

export async function fetchSkillUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  skillName: string | null,
  timezone: string = "UTC"
): Promise<Result<SkillUsagePoint[], Error>> {
  return fetchNestedUsageMetrics(baseQuery, {
    nestedPath: SKILLS_NESTED_PATH,
    filterField: SKILLS_NAME_FIELD,
    filterValue: skillName,
    timezone,
  });
}

export async function fetchAvailableSkills(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AvailableSkill[], Error>> {
  const result = await fetchNestedTermsBuckets(baseQuery, {
    nestedPath: SKILLS_NESTED_PATH,
    field: SKILLS_NAME_FIELD,
  });

  if (result.isErr()) {
    return result;
  }

  return new Ok(
    result.value.map((bucket) => ({
      skillName: bucket.key,
      totalExecutions: bucket.docCount,
    }))
  );
}

export async function fetchAvailableSkillsBySkillId(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AvailableSkillById[], Error>> {
  const result = await fetchNestedTermsBuckets(baseQuery, {
    nestedPath: SKILLS_NESTED_PATH,
    field: SKILLS_ID_FIELD,
  });

  if (result.isErr()) {
    return result;
  }

  return new Ok(
    result.value.map((bucket) => ({
      skillId: bucket.key,
      totalExecutions: bucket.docCount,
    }))
  );
}

export async function fetchUsedSkills(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<string[], Error>> {
  const result = await fetchNestedTermsBuckets(baseQuery, {
    nestedPath: SKILLS_NESTED_PATH,
    field: SKILLS_ID_FIELD,
    size: 1000,
  });

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.map((bucket) => bucket.key));
}
