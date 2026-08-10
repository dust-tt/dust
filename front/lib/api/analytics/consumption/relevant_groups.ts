import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Each analytics document stores the group sIds the triggering user
 * belonged to when the message completed.
 *
 * Group names still live in Postgres. Groups are hard-deleted, so a group
 * sId aggregated out of a historical document may no longer resolve. Such
 * ids are silently dropped.
 */

const USER_GROUP_IDS_FIELD = "user.group_ids";
const USER_ID_FIELD = "user.id";

const MEMBER_IDS_PER_GROUP_LIMIT = 1000;

export type ConsumptionRelevantGroup = {
  id: string;
  name: string;
  // Member sIds this group and the period's active users have in common
  memberIds: string[];
};

export type ConsumptionRelevantGroups = {
  groups: ConsumptionRelevantGroup[];
};

export type GetConsumptionRelevantGroupsResponse = ConsumptionRelevantGroups;

type MemberBucket = { key: string };

type GroupBucket = {
  key: string;
  members?: estypes.AggregationsMultiBucketAggregateBase<MemberBucket>;
};

type RelevantGroupsAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

export async function fetchConsumptionRelevantGroups(
  auth: Authenticator,
  { period, limit }: { period: ConsumptionPeriod; limit: number }
): Promise<Result<ConsumptionRelevantGroups, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const result = await searchConsumptionAnalytics<never, RelevantGroupsAggs>(
    query,
    {
      aggregations: {
        by_group: {
          terms: { field: USER_GROUP_IDS_FIELD, size: limit },
          aggs: {
            members: {
              terms: { field: USER_ID_FIELD, size: MEMBER_IDS_PER_GROUP_LIMIT },
            },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<GroupBucket>(
    result.value.aggregations?.by_group?.buckets
  );
  if (buckets.length === 0) {
    return new Ok({ groups: [] });
  }

  const memberIdsByGroupSId = new Map(
    buckets.map((bucket) => [
      String(bucket.key),
      bucketsToArray<MemberBucket>(bucket.members?.buckets).map((member) =>
        String(member.key)
      ),
    ])
  );

  const groupModelIds = removeNulls(
    [...memberIdsByGroupSId.keys()].map((sId) => getResourceIdFromSId(sId))
  );
  const groups = await GroupResource.fetchByModelIds(auth, groupModelIds);

  const relevantGroups = groups
    .map((group) => ({
      id: group.sId,
      name: group.name,
      memberIds: memberIdsByGroupSId.get(group.sId) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return new Ok({ groups: relevantGroups });
}
