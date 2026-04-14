/**
 * Global shutdown signal for coordinating graceful pod termination.
 *
 * This module tracks whether the pod is shutting down to coordinate between:
 * - The prestop hook
 * - The readiness probe
 * - Worker shutdown handlers
 */

let isShuttingDown = false;
const shutdownController = new AbortController();

/**
 * Marks the pod as shutting down.
 */
export function markShuttingDown(): void {
  isShuttingDown = true;
  shutdownController.abort();
}

/**
 * Checks if the pod is currently in shutdown mode.
 * Used by the readiness probe to determine if it should fail.
 */
export function isInShutdown(): boolean {
  return isShuttingDown;
}

export function getShutdownSignal(): AbortSignal {
  return shutdownController.signal;
}
