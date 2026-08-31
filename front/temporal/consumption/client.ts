import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/consumption/config";
import { consumptionEventsAppendedSignal } from "@app/temporal/consumption/signals";
import { makeConsumptionWorkflowId } from "@app/temporal/consumption/workflow_ids";
import { consumptionWorkflow } from "@app/temporal/consumption/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function signalConsumptionEventsAppended(
  authType: AuthenticatorType,
  { runKey }: { runKey: string }
): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const workflowId = makeConsumptionWorkflowId({ workspaceId, runKey });

  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.signalWithStart(consumptionWorkflow, {
      args: [authType, { runKey }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: consumptionEventsAppendedSignal,
      signalArgs: undefined,
      searchAttributes: {
        workspaceId: [workspaceId],
      },
      memo: {
        runKey,
        workspaceId,
      },
    });

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      { workflowId, workspaceId, runKey, err },
      "[Consumption] Failed to signal the consumption workflow."
    );

    return new Err(normalizeError(err));
  }
}
