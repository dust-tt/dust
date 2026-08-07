import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Groups relevant to a consumption period: the groups whose members actually
 * consumed credits during that window, resolved as of the window itself (not
 * "now") so a historical period reflects who was in the group at the time.
 *
 * There is no `group` field on the consumption index — group membership is a
 * Postgres concept — so this starts from the same real, period-ranked user
 * population `top-users` already surfaces, then resolves their group
 * membership over the period in Postgres.
 */

export type ConsumptionRelevantGroup = {
  id: string;
  name: string;
  // Member sIds this group and the period's active users have in common, so
  // the frontend can narrow a member list to a group without another call.
  memberIds: string[];
};

export type ConsumptionRelevantGroups = {
  groups: ConsumptionRelevantGroup[];
};

export type GetConsumptionRelevantGroupsResponse = ConsumptionRelevantGroups;

export async function fetchConsumptionRelevantGroups(
  auth: Authenticator,
  { period, limit }: { period: ConsumptionPeriod; limit: number }
): Promise<Result<ConsumptionRelevantGroups, ElasticsearchError>> {
  const topUsersResult = await fetchConsumptionTopGroups(auth, {
    dimension: "user",
    unit: "message",
    period,
    limit,
  });
  if (topUsersResult.isErr()) {
    return topUsersResult;
  }

  const userSids = topUsersResult.value.groups.map((group) => group.key);
  if (userSids.length === 0) {
    return new Ok({ groups: [] });
  }

  const users = await UserResource.fetchByIds(userSids);
  const groupsByUserModelId =
    await GroupResource.listGroupsForUserModelIdsInWindow({
      workspace: auth.getNonNullableWorkspace(),
      userModelIds: users.map((user) => user.id),
      window: {
        start: new Date(period.startDate),
        end: new Date(period.endDate),
      },
    });

  const groupById = new Map<string, ConsumptionRelevantGroup>();
  for (const user of users) {
    for (const group of groupsByUserModelId.get(user.id) ?? []) {
      const existing = groupById.get(group.sId);
      if (existing) {
        existing.memberIds.push(user.sId);
      } else {
        groupById.set(group.sId, {
          id: group.sId,
          name: group.name,
          memberIds: [user.sId],
        });
      }
    }
  }

  const groups = [...groupById.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return new Ok({ groups });
}
