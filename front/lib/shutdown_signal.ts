/**
 * Global shutdown signal for coordinating graceful pod termination.
 *
 * This module tracks whether the pod is shutting down to coordinate between:
 * - The prestop hook (which signals shutdown)
 * - The readiness probe (which should fail when shutting down)
 * - Connection draining (which needs the pod to stay alive)
 */

let isShuttingDown = false;

/**
 * Marks the pod as shutting down.
 * This should be called by the prestop hook to signal that the pod is terminating.
 */
export function markShuttingDown(): void {
  isShuttingDown = true;
}

/**
 * Checks if the pod is currently in shutdown mode.
 * Used by the readiness probe to determine if it should fail.
 */
export function isInShutdown(): boolean {
  return isShuttingDown;
}
