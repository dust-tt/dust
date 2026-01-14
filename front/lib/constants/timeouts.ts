/**
 * Shared timeout constants used across the application.
 *
 * These constants are defined centrally to avoid duplication and ensure consistency
 * between different parts of the system (API routes, agent loops, etc.).
 */

// This is defined as terminationGracePeriodSeconds in the deployment specification.
// DO NOT CHANGE THIS VALUE unless you update the deployment specification.
export const PRESTOP_GRACE_PERIOD_MS = 130 * 1_000; // 130 seconds grace period.

// PreStop phase durations for coordinated connection draining.
// These work together to ensure graceful shutdown:
// 1. Load balancer propagation (10s): Time for readiness=false to reach all LB backends
// 2. Wake locks (up to 120s): Critical operations must complete
// 3. Connection draining (min 60s): Existing connections gracefully close
//
// Total time: 10s + MAX(wakeLocks, 60s) ≤ 130s (grace period)
// Examples:
// - Wake locks clear in 20s: 10s + 60s = 70s total (waits extra 40s for draining)
// - Wake locks clear in 80s: 10s + 80s = 90s total (draining requirement met)
// - Wake locks take 120s: 10s + 120s = 130s total (at grace period limit)
export const PRESTOP_LB_PROPAGATION_MS = 10 * 1_000; // Load balancer propagation.
export const PRESTOP_WAKE_LOCK_MAX_WAIT_MS = 120 * 1_000; // Critical operations (max).
export const PRESTOP_MIN_DRAINING_WAIT_MS = 60 * 1_000; // Connection draining (min).

// Threshold for determining if tools should trigger async mode (2 minutes).
// This is 10 seconds before the prestop grace period to ensure sufficient buffer time.
export const LONG_RUNNING_TOOL_THRESHOLD_MS = PRESTOP_GRACE_PERIOD_MS - 10_000;

// Standard sync-to-async timeout for agent execution (10 seconds).
export const SYNC_TO_ASYNC_TIMEOUT_MS = 10 * 1_000;
