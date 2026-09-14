import { MIN_DEGRADED_DURATION_MS } from "@app/lib/api/llm/health/config";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import type * as activities from "@app/temporal/model_health/activities";
import { MAX_PROBE_ROUNDS } from "@app/temporal/model_health/config";
import { proxyActivities, sleep } from "@temporalio/workflow";

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
 * what "degraded" means while it lasts. Because that is the only state, this
 * run's start time is also the moment the endpoint became degraded, which is
 * what the detection guard reads back off `describe()`.
 *
 * Every round waits `MIN_DEGRADED_DURATION_MS` on a durable Temporal timer --
 * a worker restart mid-wait costs nothing -- and then probes once. The timer
 * comes first, so it serves as both the initial hold and the backoff between
 * failed rounds: a dead endpoint sees one round every ten minutes rather than
 * as fast as it can refuse them.
 *
 * After `MAX_PROBE_ROUNDS` the run simply ends, logging no transition. The
 * endpoint stops being degraded because the workflow id frees up, so an outage
 * still in progress is re-detected from the counters and opens a fresh run.
 */
export async function modelHealthRecoveryWorkflow(
  endpoint: DegradedModelEndpointType
): Promise<void> {
  const startedAtMs = Date.now();

  for (let round = 0; round < MAX_PROBE_ROUNDS; round++) {
    await sleep(MIN_DEGRADED_DURATION_MS);

    const healthy = await probeEndpointActivity(endpoint);
    const degradedForMs = Date.now() - startedAtMs;

    if (healthy) {
      await logModelHealthRecoveryActivity({ endpoint, degradedForMs });
      return;
    }

    await logModelHealthProbeFailedActivity({ endpoint, degradedForMs });
  }
}
