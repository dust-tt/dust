/**
 * Model health circuit breaker parameters.
 *
 * Kept free of any Temporal import so the detection rails can be unit tested
 * without a workflow environment.
 */

// Length of the sliding window, in whole UTC minutes.
export const WINDOW_MINUTES = 5;

// Counter keys are only ever read across `WINDOW_MINUTES`; the extra headroom
// covers clock skew between pods.
export const COUNTER_KEY_TTL_SECONDS = WINDOW_MINUTES * 60 * 3;
