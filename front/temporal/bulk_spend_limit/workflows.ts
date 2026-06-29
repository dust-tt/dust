import type * as activities from "@app/temporal/bulk_spend_limit/activities";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import { log, proxyActivities } from "@temporalio/workflow";

const { setSpendLimitForUsersActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "2s",
    backoffCoefficient: 2,
    maximumInterval: "1m",
  },
});

const CHUNK_SIZE = 25;

export async function bulkSetUserSpendLimitWorkflow({
  workspaceId,
  actorUserId,
  userIds,
  limit,
}: {
  workspaceId: string;
  actorUserId: string;
  userIds: string[];
  limit: UserSpendLimit;
}): Promise<void> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    const result = await setSpendLimitForUsersActivity({
      workspaceId,
      actorUserId,
      userIds: chunk,
      limit,
    });
    succeeded += result.succeeded;
    failed += result.failures.length;
  }

  log.info("[BulkSpendLimit] Completed bulk spend-limit update", {
    workspaceId,
    total: userIds.length,
    succeeded,
    failed,
  });
}
