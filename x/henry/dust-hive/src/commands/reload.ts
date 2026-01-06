import { unlink } from "node:fs/promises";
import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { getZellijLayoutPath } from "../lib/paths";
import { openCommand } from "./open";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

export const reloadCommand = withEnvironment("reload", async (env) => {
  const sessionName = `dust-hive-${env.name}`;

  logger.step("Killing existing session...");

  // Kill session first (stops it)
  const killProc = Bun.spawn(["zellij", "kill-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  // Consume pipes to prevent hanging the event loop
  await Promise.all([
    new Response(killProc.stdout).text(),
    new Response(killProc.stderr).text(),
  ]);
  await killProc.exited;

  // Then delete it (removes from list)
  const deleteProc = Bun.spawn(["zellij", "delete-session", sessionName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  // Consume pipes to prevent hanging the event loop
  await Promise.all([
    new Response(deleteProc.stdout).text(),
    new Response(deleteProc.stderr).text(),
  ]);
  await deleteProc.exited;

  // Remove old layout
  const layoutPath = getZellijLayoutPath();
  try {
    await unlink(layoutPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return openCommand(env.name);
    }
    throw error;
  }

  // Open fresh
  return openCommand(env.name);
});
