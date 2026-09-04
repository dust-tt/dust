/**
 * Model health circuit breaker parameters.
 *
 * Kept free of any Temporal import so the detection rails can be unit tested
 * without a workflow environment.
 */

// Length of the sliding window, in whole UTC minutes.
export const WINDOW_MINUTES = 5;
