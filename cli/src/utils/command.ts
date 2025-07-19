import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { execa } from "execa";

import { isCommandError, normalizeError } from "./errors.js";

interface CommandResult {
  exitCode?: number;
  stdout: string;
  stderr: string;
  command: string;
}

export interface CommandError {
  message: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  command?: string;
  signal?: string;
  timedOut?: boolean;
}

export async function executeCommand(
  command: string,
  args: string[] = [],
  cwd?: string,
  timeout: number = 30000,
  all: boolean = true
): Promise<Result<CommandResult, CommandError>> {
  try {
    const result = await execa(command, args, {
      cwd,
      timeout,
      all,
      stdio: "pipe",
      buffer: true,
    });

    return new Ok({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      command: result.command,
    });
  } catch (error: any) {
    if (isCommandError(error)) {
      return new Err(error);
    }
    return new Err({
      message: normalizeError(error).message,
    });
  }
}
