import { unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { withEnvironment } from "../lib/commands";
import { isErrnoException } from "../lib/errors";
import { logger } from "../lib/logger";
import { getZellijLayoutPath } from "../lib/paths";
import { openCommand } from "./open";

// Wait for a condition with timeout
async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

// Check if zellij socket exists for a session
async function sessionSocketExists(sessionName: string): Promise<boolean> {
  const socketDir = process.env["ZELLIJ_SOCK_DIR"] || join(process.env["HOME"] || "/tmp", ".cache", "zellij");
  const socketPath = join(socketDir, sessionName);
  try {
    await access(socketPath);
    return true;
  } catch {
    return false;
  }
}

export const reloadCommand = withEnvironment("reload", async (env) => {
  const sessionName = `dust-hive-${env.name}`;

  logger.step("Killing existing session...");

  // Use --force flag like down.ts does for consistent behavior
  // This kills the session and removes it in one operation
  const deleteProc = Bun.spawn(["zellij", "delete-session", sessionName, "--force"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await deleteProc.exited;

  // Wait for the session socket to be cleaned up (max 2 seconds)
  // This prevents a race condition where we try to create a new session
  // before the old server process has fully terminated
  const socketCleanedUp = await waitFor(
    async () => !(await sessionSocketExists(sessionName)),
    2000,
    100
  );

  if (!socketCleanedUp) {
    logger.warn("Session socket still exists after kill, proceeding anyway...");
  }

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
