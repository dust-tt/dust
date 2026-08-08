/**
 * Global shutdown signal for coordinating worker termination.
 *
 * API Pod connection draining is handled independently by its preStop hook and
 * Kubernetes endpoint termination state.
 */

const shutdownController = new AbortController();
let shutdownAbortTimeout: NodeJS.Timeout | undefined;

export const DUST_WORKER_SHUTDOWN_ABORT_REASON =
  "DUST_WORKER_SHUTDOWN_ABORT" as const;

/**
 * Marks the pod as shutting down, but lets active work use most of the grace period.
 */
export function markShuttingDownWithDelayedAbort(abortDelayMs: number): void {
  if (shutdownController.signal.aborted || shutdownAbortTimeout) {
    return;
  }

  shutdownAbortTimeout = setTimeout(abortShutdownSignal, abortDelayMs);
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
