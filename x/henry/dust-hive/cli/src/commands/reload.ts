import { unlink } from "node:fs/promises";
import { withEnvironment } from "../lib/commands";
import { isErrnoException } from "../lib/errors";
import { logger } from "../lib/logger";
import { getConfiguredMultiplexer, getSessionName } from "../lib/multiplexer";
import { openCommand } from "./open";

interface ReloadOptions {
  unifiedLogs?: boolean | undefined;
}

export const reloadCommand = withEnvironment("reload", async (env, options: ReloadOptions = {}) => {
  const multiplexer = await getConfiguredMultiplexer();
  const sessionName = getSessionName(env.name);

  logger.step("Killing existing session...");

  // Kill session first (stops it)
  await multiplexer.killSession(sessionName);

  // Then delete it (removes from list)
  await multiplexer.deleteSession(sessionName);

  // Remove old layout
  const layoutPath = multiplexer.getLayoutPath("layout.kdl");
  try {
    await unlink(layoutPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return openCommand(env.name, { unifiedLogs: options.unifiedLogs });
    }
    throw error;
  }

  // Open fresh
  return openCommand(env.name, { unifiedLogs: options.unifiedLogs });
});
