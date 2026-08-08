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

// Threshold for determining if tools should trigger async mode (2 minutes).
// This is 10 seconds before the drain deadline to ensure sufficient buffer time.
export const LONG_RUNNING_TOOL_THRESHOLD_MS =
  DEFAULT_PRESTOP_DRAIN_DURATION_MS - 10_000;

// Standard sync-to-async timeout for agent execution (10 seconds).
export const SYNC_TO_ASYNC_TIMEOUT_MS = 10 * 1_000;
