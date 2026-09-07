/**
 * Model health circuit breaker parameters.
 *
 * Kept free of any Temporal import so the detection rails can be unit tested
 * without a workflow environment.
 */

export const ERROR_RATIO_THRESHOLD = 0.2;

// Length of the sliding window, in whole UTC minutes.
export const WINDOW_MINUTES = 5;

export const MIN_ATTEMPTS_IN_WINDOW = 100;

// How long an endpoint stays degraded before the first recovery probe.
export const MIN_DEGRADED_DURATION_MS = 10 * 60 * 1000;

// Consecutive synthetic probes that must all succeed to declare a recovery.
export const PROBES_PER_RECOVERY = 3;

// How often one endpoint may be evaluated, per pod: during an outage error
// writes land hundreds of times a second on the same endpoint.
export const MIN_EVALUATION_INTERVAL_MS = 5_000;

// The next instant the recovery workflow will probe, mirroring its
// sleep-`MIN_DEGRADED_DURATION_MS`-then-probe loop from its start time.
export function nextProbeAtMs(degradedSinceMs: number, nowMs: number): number {
  const elapsedRounds = Math.floor(
    (nowMs - degradedSinceMs) / MIN_DEGRADED_DURATION_MS
  );

  return degradedSinceMs + MIN_DEGRADED_DURATION_MS * (elapsedRounds + 1);
}

// Counter keys are only ever read across `WINDOW_MINUTES`; the extra headroom
// covers clock skew between pods.
export const COUNTER_KEY_TTL_SECONDS = WINDOW_MINUTES * 60 * 3;

// Wall-clock ceiling for a single probe, from request to first event.
export const PROBE_TIMEOUT_MS = 30 * 1000;
