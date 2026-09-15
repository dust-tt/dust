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

/** PostgreSQL's invalid Unicode JSON/JSONB payload error code. */
const POSTGRES_UNSUPPORTED_UNICODE_ERROR_CODE = "22P05";

export const SANDBOX_UNSUPPORTED_UNICODE_ERROR_MESSAGE =
  "Tool arguments contain unsupported Unicode characters.";

type DatabaseErrorLike = {
  code?: unknown;
  original?: { code?: unknown };
  parent?: { code?: unknown };
};

/**
 * Detects the PostgreSQL error raised when a JSON/JSONB value contains an invalid Unicode
 * escape or a null byte. Sequelize may expose the PostgreSQL code at different nesting levels.
 */
export function isUnsupportedUnicodeDatabaseError(
  error: unknown
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const databaseError = error as DatabaseErrorLike;
  return [
    databaseError.code,
    databaseError.original?.code,
    databaseError.parent?.code,
  ].includes(POSTGRES_UNSUPPORTED_UNICODE_ERROR_CODE);
}
