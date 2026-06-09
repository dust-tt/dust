// Command utilities - shared helpers for command handlers

import { setLastActiveEnv } from "./activity";
import { type Environment, getEnvironment } from "./environment";
import { restoreTerminal, selectEnvironment } from "./prompt";
import { CommandError, Err, Ok, type Result, envNotFoundError } from "./result";

export type EnvironmentNameArg = string | string[] | undefined;

export function normalizeEnvironmentNames(nameArg: EnvironmentNameArg): string[] {
  if (nameArg === undefined) {
    return [];
  }

  if (Array.isArray(nameArg)) {
    return nameArg;
  }

  return [nameArg];
}

export interface RequireEnvironmentOptions {
  /** If provided, shows a confirmation prompt after selection.
   * Use {name} as placeholder for the selected environment name. */
  confirmMessage?: string;
  /** If true, skip restoring terminal after interactive selection.
   * Useful when more interactive prompts follow. Default: false */
  skipRestoreTerminal?: boolean;
}

// Require an environment to exist, returning error if not found
// If nameArg is not provided, shows interactive selection prompt
export async function requireEnvironment(
  nameArg: string | undefined,
  commandName: string,
  options?: RequireEnvironmentOptions
): Promise<Result<Environment, CommandError>> {
  let name = nameArg;

  // If no name provided, prompt interactively
  if (!name) {
    const selected = await selectEnvironment({
      message: `Select environment for ${commandName}`,
      ...(options?.confirmMessage && { confirmMessage: options.confirmMessage }),
    });

    // Restore terminal to cooked mode after interactive prompt
    // This prevents terminal corruption when spawning subprocesses like zellij
    if (!options?.skipRestoreTerminal) {
      restoreTerminal();
    }

    if (!selected) {
      return Err(new CommandError("No environment selected"));
    }

    name = selected;
  }

  const env = await getEnvironment(name);
  if (!env) {
    return Err(envNotFoundError(name));
  }

  // Track this environment as last-active
  await setLastActiveEnv(env.name);

  return Ok(env);
}

// Wrapper for commands that operate on a specific environment
// Handles: interactive selection, validation, activity tracking
export function withEnvironment<T extends unknown[]>(
  commandName: string,
  handler: (env: Environment, ...args: T) => Promise<Result<void>>
): (nameArg: string | undefined, ...args: T) => Promise<Result<void>> {
  return async (nameArg: string | undefined, ...args: T): Promise<Result<void>> => {
    const envResult = await requireEnvironment(nameArg, commandName);
    if (!envResult.ok) return envResult;

    return handler(envResult.value, ...args);
  };
}

// Wrapper for commands that can operate on one or more environments.
// When no name is provided, it preserves the existing interactive selection flow.
export function withEnvironments<T extends unknown[]>(
  commandName: string,
  handler: (env: Environment, ...args: T) => Promise<Result<void>>
): (nameArg: EnvironmentNameArg, ...args: T) => Promise<Result<void>> {
  return async (nameArg: EnvironmentNameArg, ...args: T): Promise<Result<void>> => {
    const names = normalizeEnvironmentNames(nameArg);

    if (names.length === 0) {
      const envResult = await requireEnvironment(undefined, commandName);
      if (!envResult.ok) return envResult;

      return handler(envResult.value, ...args);
    }

    for (const name of names) {
      const envResult = await requireEnvironment(name, commandName);
      if (!envResult.ok) return envResult;

      const result = await handler(envResult.value, ...args);
      if (!result.ok) return result;
    }

    return Ok(undefined);
  };
}

// Re-export CommandError for convenience
export { CommandError } from "./result";
