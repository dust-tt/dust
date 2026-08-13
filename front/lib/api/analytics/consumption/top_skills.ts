import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Skills ranked by the credits they consumed over the period, averaged per
 * invocation, on the same footing as the tools: a skill is credited with the
 * tool calls it is responsible for, so its unit is the invocation, not the
 * message.
 *
 * Attribution is multi-valued — one tool call can be attributed to several
 * skills at once — so each of them is credited with the full call and the rows
 * can add up to more than the credits the tool documents hold. They also add up
 * to less than the period's total, for the same reason the tools do: the model
 * work around a tool call belongs to the LLM documents.
 */

export type ConsumptionTopSkillRow = {
  skillId: string;
  name: string;
  description: string | null;
  icon: string | null;
  credits: number;
  invocationCount: number;
  avgCreditsPerInvocation: number;
};

export type ConsumptionTopSkills = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  skills: ConsumptionTopSkillRow[];
};

export type GetConsumptionTopSkillsResponse = ConsumptionTopSkills;

export async function fetchConsumptionTopSkills(
  auth: Authenticator,
  {
    period,
    limit,
    offset = 0,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopSkills, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "skill",
    period,
    limit,
    offset,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  const rows = await resolveConsumptionGroupLabels(auth, "skill", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    skills: rows.map((row) => ({
      skillId: row.key,
      name: row.name,
      description: row.description,
      icon: row.icon ?? null,
      credits: row.credits,
      invocationCount: row.count,
      avgCreditsPerInvocation: row.avgCredits,
    })),
  });
}
