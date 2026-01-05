// Result type for explicit error handling without process.exit

export type Result<T, E = CommandError> = { ok: true; value: T } | { ok: false; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Standard error type for commands
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

// Helper to create usage error
export function usageError(commandName: string): CommandError {
  return new CommandError(`Usage: dust-hive ${commandName} NAME`);
}

// Helper to create "environment not found" error
export function envNotFoundError(name: string): CommandError {
  return new CommandError(`Environment '${name}' not found`);
}
