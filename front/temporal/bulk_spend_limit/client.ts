import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/bulk_spend_limit/config";
import { makeBulkSpendLimitWorkflowId } from "@app/temporal/bulk_spend_limit/helpers";
import { bulkSetUserSpendLimitWorkflow } from "@app/temporal/bulk_spend_limit/workflows";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

export async function launchBulkSetUserSpendLimitWorkflow({
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
    await client.workflow.start(bulkSetUserSpendLimitWorkflow, {
      args: [{ workspaceId, actorUserId, userIds, limit }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId, actorUserId, memberCount: userIds.length },
    });
    return new Ok({ workflowId });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        { workflowId, workspaceId, err: e },
        "[BulkSpendLimit] Failed to start workflow"
      );
    }
    return new Err(normalizeError(e));
  }
}
