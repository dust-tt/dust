import { MIN_DEGRADED_DURATION_MS } from "@app/lib/api/llm/health/config";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import type * as activities from "@app/temporal/model_health/activities";
import { MAX_PROBE_ROUNDS } from "@app/temporal/model_health/config";
import { patched, proxyActivities, sleep } from "@temporalio/workflow";

const { probeEndpointActivity } = proxyActivities<typeof activities>({
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

const {
  clearAutomaticModelDegradationActivity,
  getAutomaticModelDegradationExpiresAtActivity,
  logModelHealthProbeFailedActivity,
  logModelHealthRecoveryActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

/**
 * Recovery for one degraded endpoint.
 *
 * Started by whichever pod detected the breach; the deterministic workflow id
 * makes concurrent starts collapse into this single run. Postgres stores the
 * endpoint's serving state while this workflow owns recovery checks.
 *
 * Every round waits `MIN_DEGRADED_DURATION_MS` on a durable Temporal timer --
 * a worker restart mid-wait costs nothing -- and then probes once. The timer
 * comes first, so it serves as both the initial hold and the backoff between
 * failed rounds: a dead endpoint sees one round every ten minutes rather than
 * as fast as it can refuse them.
 *
 * After `MAX_PROBE_ROUNDS` the run ends without clearing its last failed-probe
 * renewal. That lease expires on its own; an outage still in progress is
 * re-detected from the counters and opens a fresh run.
 */
export async function modelHealthRecoveryWorkflow(
  endpoint: DegradedModelEndpointType
): Promise<void> {
  const startedAtMs = Date.now();
  const usesPostgresState = patched("model-health-postgres-state");

  for (let round = 0; round < MAX_PROBE_ROUNDS; round++) {
    await sleep(MIN_DEGRADED_DURATION_MS);

    // Recovery may only clear the lease generation it observed before probing.
    // A concurrent detector renewal after this read must survive a delayed
    // successful probe.
    const observedExpiresAtMs = usesPostgresState
      ? await getAutomaticModelDegradationExpiresAtActivity(endpoint)
      : null;
    const healthy = await probeEndpointActivity(endpoint);
    const degradedForMs = Date.now() - startedAtMs;

    if (healthy) {
      if (!usesPostgresState) {
        // Preserve the command sequence of recovery workflows started before
        // Postgres became authoritative.
        await logModelHealthRecoveryActivity({ endpoint, degradedForMs });
        return;
      }

      const cleared = await logModelHealthRecoveryActivity({
        endpoint,
        degradedForMs,
        observedExpiresAtMs,
      });
      if (cleared || observedExpiresAtMs === null) {
        return;
      }
      continue;
    }

    await logModelHealthProbeFailedActivity({ endpoint, degradedForMs });
  }

  if (!usesPostgresState) {
    // Keep replay compatibility with the old Redis-backed workflow. The
    // activity is now a no-op because an automatic Postgres lease expires.
    await clearAutomaticModelDegradationActivity(endpoint);
  }
}
