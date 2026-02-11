export interface CommandError {
  message: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  command?: string;
  signal?: string;
  timedOut?: boolean;
}

export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(errorToString(error));
}

export function isCommandError(error: unknown): error is CommandError {
  return !!(
    error &&
    typeof error === "object" &&
    "exitCode" in error &&
    "stdout" in error &&
    "stderr" in error &&
    "command" in error
  );
}
