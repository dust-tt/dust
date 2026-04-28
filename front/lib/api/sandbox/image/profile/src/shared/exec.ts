import { spawnSync } from "node:child_process";

export interface CommandResult {
  readonly error?: NodeJS.ErrnoException;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runCommandSync(
  command: string,
  args: readonly string[],
  options?: {
    cwd?: string;
    input?: string;
    maxBufferBytes?: number;
  }
): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: options?.cwd,
    input: options?.input,
    encoding: "utf8",
    maxBuffer: options?.maxBufferBytes ?? 32 * 1024 * 1024,
  });

  return {
    error: result.error as NodeJS.ErrnoException | undefined,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
