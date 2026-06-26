import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { setUserSpendLimit } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";

const SET_SPEND_LIMIT_CONCURRENCY = 2;

export type SetSpendLimitChunkResult = {
  succeeded: number;
  failures: { userId: string; message: string }[];
};

export async function setSpendLimitForUsersActivity({
  workspaceId,
  actorUserId,
  userIds,
  limit,
}: {
  workspaceId: string;
  actorUserId: string;
  userIds: string[];
  limit: UserSpendLimit;
}): Promise<SetSpendLimitChunkResult> {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    actorUserId,
    workspaceId
  );
  const auditContext = getAuditLogContext(auth);

  const failures: { userId: string; message: string }[] = [];
  const transientFailures: { userId: string; message: string }[] = [];
  let succeeded = 0;

  await concurrentExecutor(
    userIds,
    async (userId) => {
      const result = await setUserSpendLimit(auth, {
        userId,
        limit,
        auditContext,
      });
      if (result.isOk()) {
        succeeded++;
        return;
      }
      const failure = { userId, message: result.error.message };
      if (result.error.type === "metronome_error") {
        transientFailures.push(failure);
      } else {
        failures.push(failure);
      }
      logger.error(
        { workspaceId, userId, err: result.error },
        "[BulkSpendLimit] Failed to set spend limit for member"
      );
    },
    { concurrency: SET_SPEND_LIMIT_CONCURRENCY }
  );

  // Throw so Temporal retries the whole chunk; the throw is intentionally after
  // the executor so every member is attempted and permanent failures are still
  // recorded on the final (exhausted) attempt.
  if (transientFailures.length > 0) {
    throw new Error(
      `[BulkSpendLimit] ${transientFailures.length} transient failure(s) setting spend limit; retrying. ` +
        `First: ${transientFailures[0].userId}: ${transientFailures[0].message}`
    );
  }

  return { succeeded, failures };
}
