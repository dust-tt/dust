/**
 * Shared timeout constants used across the application.
 *
 * These constants are defined centrally to avoid duplication and ensure consistency
 * between different parts of the system (API routes, agent loops, etc.).
 */

// Keep serving during this window while Kubernetes marks the terminating endpoint
// unready and GKE removes it from the NEG. Deployments can override this value
// when their backend service uses a longer connection-draining timeout.
export const DEFAULT_PRESTOP_DRAIN_DURATION_MS = 120 * 1_000;
