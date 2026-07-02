import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { makeBulkSpendLimitWorkflowId } from "@app/temporal/bulk_spend_limit/helpers";
import { QUEUE_NAME } from "@app/temporal/metronome_events_queue/config";
import { bulkSetUserSpendLimitWorkflow } from "@app/temporal/metronome_events_queue/workflows";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

/**
 * Start a bulk spend-limit workflow and wait for it to complete, so callers
 * (the members table) can refresh the updated limits as soon as the request
 * returns. The wait is bounded by the caller's HTTP timeout — acceptable while
 * selections stay in the hundreds of members (one Metronome alert upsert per
 * member); revisit with an async status-polling flow if that stops holding.
 */
export async function runBulkSetUserSpendLimitWorkflow({
  workspaceId,
  actorUserId,
  userIds,
  limit,
}: {
  workspaceId: string;
  actorUserId: string;
  userIds: string[];
  limit: UserSpendLimit;
}): Promise<Result<{ workflowId: string }, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeBulkSpendLimitWorkflowId({
    workspaceId,
    token: generateRandomModelSId(),
  });

  try {
    const handle = await client.workflow.start(bulkSetUserSpendLimitWorkflow, {
      args: [{ workspaceId, actorUserId, userIds, limit }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId, actorUserId, memberCount: userIds.length },
    });
    await handle.result();
    return new Ok({ workflowId });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        { workflowId, workspaceId, err: e },
        "[BulkSpendLimit] Failed to run workflow"
      );
    }
    return new Err(normalizeError(e));
  }
}
