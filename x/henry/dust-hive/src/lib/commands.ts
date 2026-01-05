// Command utilities - shared helpers for command handlers

import { setLastActiveEnv } from "./activity";
import { type Environment, getEnvironment } from "./environment";
import { selectEnvironment } from "./prompt";
import { CommandError, Err, Ok, type Result, envNotFoundError } from "./result";

// Require an environment to exist, returning error if not found
// If nameArg is not provided, shows interactive selection prompt
export async function requireEnvironment(
  nameArg: string | undefined,
  commandName: string
): Promise<Result<Environment, CommandError>> {
  let name = nameArg;

  // If no name provided, prompt interactively
  if (!name) {
    const selected = await selectEnvironment({
      message: `Select environment for ${commandName}`,
    });

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

// Re-export CommandError for convenience
export { CommandError } from "./result";
