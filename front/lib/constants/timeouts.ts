/**
 * Shared timeout constants used across the application.
 *
 * These constants are defined centrally to avoid duplication and ensure consistency
 * between different parts of the system (API routes, agent loops, etc.).
 */

// This is defined as terminationGracePeriodSeconds in the deployment specification.
// DO NOT CHANGE THIS VALUE unless you update the deployment specification.
export const PRESTOP_GRACE_PERIOD_MS = 130 * 1_000; // 130 seconds grace period.

// Threshold for determining if tools should trigger async mode (2 minutes).
// This is 10 seconds before the prestop grace period to ensure sufficient buffer time.
export const LONG_RUNNING_TOOL_THRESHOLD_MS = PRESTOP_GRACE_PERIOD_MS - 10_000;

// Standard sync-to-async timeout for agent execution (10 seconds).
export const SYNC_TO_ASYNC_TIMEOUT_MS = 10 * 1_000;
