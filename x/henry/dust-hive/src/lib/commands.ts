// Command utilities - shared helpers for command handlers

import { type Environment, getEnvironment } from "./environment";
import { type CommandError, Err, Ok, type Result, envNotFoundError, usageError } from "./result";

// Require an environment to exist, returning error if not found
// Handles both "name not provided" and "environment not found" cases
export async function requireEnvironment(
  nameArg: string | undefined,
  commandName: string
): Promise<Result<Environment, CommandError>> {
  if (!nameArg) {
    return Err(usageError(commandName));
  }

  const env = await getEnvironment(nameArg);
  if (!env) {
    return Err(envNotFoundError(nameArg));
  }

  return Ok(env);
}
