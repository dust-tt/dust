/**
 * The sandbox was not running when a caller asked to use it without creating, waking, or
 * recreating it.
 *
 * Raised before any work is dispatched to the sandbox, so the caller is free to retry through a
 * path that can afford to wait for one.
 */
export class SandboxNotRunningError extends Error {
  constructor() {
    super("The sandbox is not running.");
    this.name = "SandboxNotRunningError";
  }
}

export function isSandboxNotRunningError(
  error: Error
): error is SandboxNotRunningError {
  return error instanceof SandboxNotRunningError;
}
