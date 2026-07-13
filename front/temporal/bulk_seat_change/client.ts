import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { makeBulkSeatChangeWorkflowId } from "@app/temporal/bulk_seat_change/helpers";
import { QUEUE_NAME } from "@app/temporal/metronome_events_queue/config";
import { bulkChangeSeatTypeWorkflow } from "@app/temporal/metronome_events_queue/workflows";
import type { PaidSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

/**
 * Start a bulk seat-change workflow and wait for it to complete, so callers
 * (the members table) can refresh the updated seats as soon as the request
 * returns. The wait is bounded by the caller's HTTP timeout — acceptable while
 * selections stay in the hundreds of members (each seat change is a membership
 * write plus a debounced Metronome sync); revisit with an async status-polling
 * flow if that stops holding.
 */
export async function runBulkChangeSeatTypeWorkflow({
  workspaceId,
  actorUserId,
  userIds,
  seatType,
}: {
  workspaceId: string;
  actorUserId: string;
  userIds: string[];
  seatType: PaidSeatType;
}): Promise<Result<{ workflowId: string }, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeBulkSeatChangeWorkflowId({
    workspaceId,
    token: generateRandomModelSId(),
  });

  try {
    const handle = await client.workflow.start(bulkChangeSeatTypeWorkflow, {
      args: [{ workspaceId, actorUserId, userIds, seatType }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId, actorUserId, seatType, memberCount: userIds.length },
    });
    await handle.result();
    return new Ok({ workflowId });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        { workflowId, workspaceId, err: e },
        "[BulkSeatChange] Failed to run workflow"
      );
    }
    return new Err(normalizeError(e));
  }
}
