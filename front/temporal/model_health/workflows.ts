import { MIN_DEGRADED_DURATION_MS } from "@app/lib/api/llm/health/config";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import type * as activities from "@app/temporal/model_health/activities";
import { MAX_PROBE_ROUNDS_PER_RUN } from "@app/temporal/model_health/config";
import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";

const {
  probeEndpointActivity,
  logModelHealthProbeFailedActivity,
  logModelHealthRecoveryActivity,
} = proxyActivities<typeof activities>({
  // A round is `PROBES_PER_RECOVERY` sequential provider calls, so give it room
  // for slow-but-alive providers. This is the probe's only timeout: it runs
  // outside the agent loop, so the stream watchdog never sees it.
  startToCloseTimeout: "5 minutes",
  retry: {
    // The probes inside the activity are the retry. Retrying the activity on top
    // would multiply the calls and blur what "3 probes passed" means.
    maximumAttempts: 1,
  },
});

/**
 * Recovery for one degraded endpoint.
 *
 * Started by whichever pod detected the breach; the deterministic workflow id
 * makes concurrent starts collapse into this single run, and its existence is
 * what "degraded" means while it lasts.
 *
 * Holds for `MIN_DEGRADED_DURATION_MS` on a durable Temporal timer -- a worker
 * restart mid-hold costs nothing -- then probes until the endpoint answers.
 *
 * There is no sleep between failed rounds. A round is three sequential provider
 * calls, so the loop paces itself on real provider latency rather than spinning.
 */
export async function modelHealthRecoveryWorkflow(
  endpoint: DegradedModelEndpointType,
  degradedAtMs?: number
): Promise<void> {
  // Preserved across `continueAsNew` so the recovery log reports the full
  // outage, not just the last run.
  const startedAtMs = degradedAtMs ?? Date.now();

  if (degradedAtMs === undefined) {
    await sleep(MIN_DEGRADED_DURATION_MS);
  }

  for (let round = 0; round < MAX_PROBE_ROUNDS_PER_RUN; round++) {
    const healthy = await probeEndpointActivity(endpoint);
    const degradedForMs = Date.now() - startedAtMs;

    if (healthy) {
      await logModelHealthRecoveryActivity({ endpoint, degradedForMs });
      return;
    }

    await logModelHealthProbeFailedActivity({ endpoint, degradedForMs });
  }

  await continueAsNew<typeof modelHealthRecoveryWorkflow>(
    endpoint,
    startedAtMs
  );
}
