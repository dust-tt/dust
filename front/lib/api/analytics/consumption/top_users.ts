import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
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

/**
 * Members ranked by the credits they consumed over the period, averaged per
 * message: a member's credits are spread over the messages they triggered, so
 * the average is what one of their messages costs.
 *
 * Consumption with no member behind it (programmatic runs, triggers) carries no
 * user id and therefore has no bucket here, so the rows do not add up to the
 * period's total.
 */

export type ConsumptionTopUserRow = {
  userId: string;
  name: string;
  pictureUrl: string | null;
  credits: number;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopUsers = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  users: ConsumptionTopUserRow[];
};

export type GetConsumptionTopUsersResponse = ConsumptionTopUsers;

export async function fetchConsumptionTopUsers(
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
): Promise<Result<ConsumptionTopUsers, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "user",
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
    "user",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    users: groups.map((group) => ({
      userId: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      pictureUrl: labels.get(group.key)?.pictureUrl ?? null,
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
