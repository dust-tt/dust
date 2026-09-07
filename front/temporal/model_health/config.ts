import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";

const QUEUE_VERSION = 1;
export const QUEUE_NAME = `model-health-queue-v${QUEUE_VERSION}`;

// Probe rounds before the run gives up and ends. At one round per
// `MIN_DEGRADED_DURATION_MS` that is a shade under 17 hours, past which an
// endpoint is a human problem rather than something to keep probing on the same
// history. Ending is safe: nothing pins the endpoint healthy, so a breach that
// is still live opens a fresh run.
export const MAX_PROBE_ROUNDS = 100;

/**
 * The workflow id *is* the state in this phase: while a recovery workflow with
 * this id is running, the endpoint is degraded. Temporal's workflow-id
 * uniqueness therefore doubles as the cross-pod dedup, and the default
 * `ALLOW_DUPLICATE` reuse policy frees the id once recovery completes so a later
 * breach can open a fresh one.
 */
export function recoveryWorkflowId({
  modelId,
  providerId,
  host,
}: DegradedModelEndpointType): string {
  const slug = `${providerId}-${modelId}-${host}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  return `model-health-${slug}`;
}
