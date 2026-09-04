import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import {
  QUEUE_NAME,
  recoveryWorkflowId,
} from "@app/temporal/model_health/config";
import { modelHealthRecoveryWorkflow } from "@app/temporal/model_health/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

export type LaunchRecoveryOutcome = "started" | "already_degraded";

/**
 * Declares an endpoint degraded by starting its recovery workflow.
 *
 * Idempotent by construction: the workflow id is derived from the endpoint, so
 * every pod that detects the same breach in the same instant lands on the same
 * id and all but one get `WorkflowExecutionAlreadyStartedError` back. That
 * rejection is not a failure -- it is how we learn the endpoint was already
 * degraded -- so it comes back as an outcome rather than an error.
 */
export async function launchModelHealthRecovery(
  endpoint: DegradedModelEndpointType
): Promise<Result<LaunchRecoveryOutcome, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = recoveryWorkflowId(endpoint);

  try {
    await client.workflow.start(modelHealthRecoveryWorkflow, {
      args: [endpoint],
      taskQueue: QUEUE_NAME,
      workflowId,
    });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return new Ok("already_degraded");
    }

    return new Err(normalizeError(err));
  }

  return new Ok("started");
}
