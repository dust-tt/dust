/**
 * Global shutdown signal for coordinating graceful pod termination.
 *
 * This module tracks whether the pod is shutting down to coordinate between:
 * - The prestop hook (which signals shutdown)
 * - The readiness probe (which should fail when shutting down)
 * - Connection draining (which needs the pod to stay alive)
 * - Worker shutdown handlers
 */

let isShuttingDown = false;
const shutdownController = new AbortController();
let shutdownAbortTimeout: NodeJS.Timeout | undefined;

export const DUST_WORKER_SHUTDOWN_ABORT_REASON =
  "DUST_WORKER_SHUTDOWN_ABORT" as const;

/**
 * Marks the pod as shutting down.
 */
export function markShuttingDown(): void {
  isShuttingDown = true;
  abortShutdownSignal();
}

/**
 * Marks the pod as shutting down, but lets active work use most of the grace period.
 */
export function markShuttingDownWithDelayedAbort(abortDelayMs: number): void {
  isShuttingDown = true;

  if (shutdownController.signal.aborted || shutdownAbortTimeout) {
    return;
  }

  shutdownAbortTimeout = setTimeout(abortShutdownSignal, abortDelayMs);
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

function abortShutdownSignal(): void {
  if (shutdownAbortTimeout) {
    clearTimeout(shutdownAbortTimeout);
    shutdownAbortTimeout = undefined;
  }

  if (shutdownController.signal.aborted) {
    return;
  }

  shutdownController.abort(DUST_WORKER_SHUTDOWN_ABORT_REASON);
}
