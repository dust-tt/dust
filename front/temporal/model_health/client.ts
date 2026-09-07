import { healthLogger } from "@app/lib/api/llm/health/logger";
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

/**
 * How the endpoint came to be degraded, and since when.
 *
 * `degradedSinceMs` is the recovery workflow's start time, which is what pins
 * the whole schedule: the workflow probes at that instant plus every multiple of
 * `MIN_DEGRADED_DURATION_MS`, so it is the only thing a caller needs to know
 * when the endpoint could next change state. It is null only when the workflow
 * is running but its start time could not be read.
 */
export type LaunchRecoveryOutcome =
  | { outcome: "started"; degradedSinceMs: number }
  | { outcome: "already_degraded"; degradedSinceMs: number | null };

/**
 * Reads back the start time of the run that rejected our own start.
 *
 * There is exactly one run per degradation -- the workflow never continues as
 * new -- so this run's start time is the moment the endpoint became degraded,
 * with no chain to walk back.
 */
async function describeDegradedSinceMs(
  client: Awaited<ReturnType<typeof getTemporalClientForFrontNamespace>>,
  workflowId: string
): Promise<number | null> {
  try {
    const description = await client.workflow.getHandle(workflowId).describe();

    // It can have finished in the moment between the rejected start and this
    // call, in which case the endpoint is no longer degraded and the caller
    // should come back rather than wait on a schedule that has ended.
    if (description.status.name !== "RUNNING") {
      return null;
    }

    return description.startTime.getTime();
  } catch (err) {
    healthLogger.error(
      { err: normalizeError(err), workflowId },
      "Failed to read the model health recovery workflow start time"
    );

    return null;
  }
}

/**
 * Declares an endpoint degraded by starting its recovery workflow.
 *
 * Idempotent by construction: the workflow id is derived from the endpoint, so
 * every pod that detects the same breach in the same instant lands on the same
 * id and all but one get `WorkflowExecutionAlreadyStartedError` back. That
 * rejection is not a failure -- it is how we learn the endpoint was already
 * degraded -- so it comes back as an outcome rather than an error. The error
 * carries only the workflow id, so the start time costs one `describe()`, on
 * that path alone.
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
      return new Ok({
        outcome: "already_degraded",
        degradedSinceMs: await describeDegradedSinceMs(client, workflowId),
      });
    }

    return new Err(normalizeError(err));
  }

  // Our own start, so the schedule is anchored here without asking the server.
  return new Ok({ outcome: "started", degradedSinceMs: Date.now() });
}
