/**
 * From front/, with the target region's Elasticsearch environment loaded:
 *   npx tsx scripts/list_active_user_ids.ts --execute > active-user-ids.txt
 *
 * Defaults to workspace n9puyOJxmD and August 2026 (UTC).
 */
import {
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import { writeFileSync } from "fs";

type UserKey = { user: string };
type ActiveUsersAggs = {
  users: {
    buckets: { key: UserKey }[];
    after_key?: UserKey;
  };
};

/**
 * @cc [owner:aubin-tchoi,label:product] timeseries-active-users
 * Prints each distinct user.id in the workspace's consumption documents completed
 * during August 2026 UTC, using the same scope as the unfiltered timeseries.
 */
async function main({ workspaceId }: { workspaceId: string }) {
  // Same filters as buildConsumptionScopeQuery, without a database/auth lookup.
  const query = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        {
          range: {
            [COMPLETED_AT_FIELD]: {
              gte: "2026-08-01T00:00:00.000Z",
              lt: "2026-09-01T00:00:00.000Z",
            },
          },
        },
      ],
    },
  };

  const userIds: string[] = [];
  let afterKey: UserKey | undefined;
  do {
    const result = await searchConsumptionAnalytics<never, ActiveUsersAggs>(
      query,
      {
        size: 0,
        aggregations: {
          users: {
            composite: {
              size: 1000,
              sources: [
                {
                  user: { terms: { field: CONSUMPTION_DIMENSION_FIELDS.user } },
                },
              ],
              ...(afterKey ? { after: afterKey } : {}),
            },
          },
        },
      }
    );
    if (result.isErr()) {
      throw result.error;
    }
    const { aggregations, timed_out, _shards } = result.value;
    if (timed_out || _shards.failed > 0 || !aggregations?.users) {
      throw new Error(
        "Incomplete Elasticsearch response; no IDs were printed."
      );
    }

    const { buckets, after_key } = aggregations.users;
    userIds.push(...buckets.map((bucket) => bucket.key.user));
    afterKey = buckets.length > 0 ? after_key : undefined;
  } while (afterKey);

  if (userIds.length > 0) {
    writeFileSync(1, `${userIds.join("\n")}\n`);
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      default: "n9puyOJxmD",
      description: "Workspace sId",
    },
  },
  main
);
