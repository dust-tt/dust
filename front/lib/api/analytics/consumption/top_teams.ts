import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { resolveDimensionLabels } from "./labels";

/**
 * Teams ranked by the credits consumed by their members over the period,
 * averaged per message. A member can belong to several teams, in which case
 * their consumption is attributed to each team they belonged to when the
 * message completed.
 */

export type ConsumptionTopTeamRow = {
  teamId: string;
  name: string;
  credits: number;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopTeams = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  teams: ConsumptionTopTeamRow[];
};

export type GetConsumptionTopTeamsResponse = ConsumptionTopTeams;

export async function fetchConsumptionTopTeams(
  auth: Authenticator,
  {
    period,
    limit,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopTeams, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "team",
    unit: "message",
    period,
    limit,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, totalCredits } = result.value;

  const labels = await resolveDimensionLabels(
    auth,
    "team",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    teams: groups.map((group) => ({
      teamId: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
