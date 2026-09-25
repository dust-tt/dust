/**
 * The sandbox was not running when a caller asked to use it without creating, waking, or
 * recreating it, or could not be brought up for a wake-only caller without creating one.
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
