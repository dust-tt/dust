import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
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
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopUsers = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  users: ConsumptionTopUserRow[];
};

export type GetConsumptionTopUsersResponse = ConsumptionTopUsers;

export async function fetchConsumptionTopUsers(
  auth: Authenticator,
  {
    period,
    limit,
    offset = 0,
    search,
    filter,
    sortOrder,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
    sortOrder?: ConsumptionTopSortOrder;
  }
): Promise<Result<ConsumptionTopUsers, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "user",
    period,
    limit,
    offset,
    search,
    filter,
    sortOrder,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  const rows = await resolveConsumptionGroupLabels(auth, "user", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    users: rows.map((row) => ({
      userId: row.key,
      name: row.name,
      pictureUrl: row.pictureUrl,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
