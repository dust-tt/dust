import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/credit_consumption/config";
import { consumptionEventsAppendedSignal } from "@app/temporal/credit_consumption/signals";
import { makeConsumptionWorkflowId } from "@app/temporal/credit_consumption/workflow_ids";
import { creditConsumptionWorkflow } from "@app/temporal/credit_consumption/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function signalConsumptionEventsAppended(
  authType: AuthenticatorType,
  { runKey }: { runKey: string }
): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const workflowId = makeConsumptionWorkflowId({ workspaceId, runKey });
  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.workflow.signalWithStart(creditConsumptionWorkflow, {
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
