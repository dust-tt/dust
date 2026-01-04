import { unlink } from "node:fs/promises";
import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { getZellijLayoutPath } from "../lib/paths";
import type { Result } from "../lib/result";
import { openCommand } from "./open";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

export async function reloadCommand(nameArg: string | undefined): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "reload");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  const sessionName = `dust-hive-${env.name}`;

  logger.step("Killing existing session...");

  // Kill session first (stops it)
  const killProc = Bun.spawn(["zellij", "kill-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await killProc.exited;

  // Then delete it (removes from list)
  const deleteProc = Bun.spawn(["zellij", "delete-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await deleteProc.exited;

  // Remove old layout
  const layoutPath = getZellijLayoutPath();
  try {
    await unlink(layoutPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return openCommand(nameArg);
    }
    throw error;
  }

  // Open fresh
  return openCommand(nameArg);
}
