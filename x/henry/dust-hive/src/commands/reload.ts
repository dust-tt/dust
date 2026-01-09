import { unlink } from "node:fs/promises";
import { withEnvironment } from "../lib/commands";
import { isErrnoException } from "../lib/errors";
import { logger } from "../lib/logger";
import { getZellijLayoutPath } from "../lib/paths";
import { openCommand } from "./open";

export const reloadCommand = withEnvironment("reload", async (env) => {
  const sessionName = `dust-hive-${env.slug}`;

  logger.step("Killing existing session...");

  // Kill session first (stops it)
  const killProc = Bun.spawn(["zellij", "kill-session", sessionName], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await killProc.exited;

  // Then delete it (removes from list)
  const deleteProc = Bun.spawn(["zellij", "delete-session", sessionName], {
    stdout: "ignore",
    stderr: "ignore",
  });
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
