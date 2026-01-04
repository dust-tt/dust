import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { getZellijLayoutPath } from "../lib/paths";
import type { Result } from "../lib/result";
import { openCommand } from "./open";

export async function reloadCommand(args: string[]): Promise<Result<void>> {
  const envResult = await requireEnvironment(args[0], "reload");
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
    if (await Bun.file(layoutPath).exists()) {
      const { unlink } = await import("node:fs/promises");
      await unlink(layoutPath);
    }
  } catch (error) {
    // Race condition: file deleted between exists() and unlink()
    logger.warn(
      `Could not remove layout: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Open fresh
  return openCommand(args);
}
