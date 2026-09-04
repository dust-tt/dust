/**
 * Model health circuit breaker parameters.
 *
 * Kept free of any Temporal import so the detection rails can be unit tested
 * without a workflow environment.
 */

export const ERROR_RATIO_THRESHOLD = 0.2;

// Length of the sliding window, in whole UTC minutes.
export const WINDOW_MINUTES = 5;

export const MIN_ATTEMPTS_IN_WINDOW = 200;

// How long an endpoint stays degraded before the first recovery probe.
export const MIN_DEGRADED_DURATION_MS = 10 * 60 * 1000;

// Consecutive synthetic probes that must all succeed to declare a recovery.
export const PROBES_PER_RECOVERY = 3;

// How often one endpoint may be evaluated, per pod. A breach can only begin
// with an error write, and during an outage those land hundreds of times a
// second on the same endpoint: evaluating every one would re-read the same
// window, and hand Temporal a rejected duplicate start, hundreds of times to
// learn the same thing.
export const MIN_EVALUATION_INTERVAL_MS = 5_000;

// Counter keys are only ever read across `WINDOW_MINUTES`; the extra headroom
// covers clock skew between pods.
export const COUNTER_KEY_TTL_SECONDS = WINDOW_MINUTES * 60 * 3;

// Wall-clock ceiling for a single probe, from request to first event.
export const PROBE_TIMEOUT_MS = 30 * 1000;
