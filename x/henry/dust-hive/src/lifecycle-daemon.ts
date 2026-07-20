#!/usr/bin/env bun

import { readFileSync, unlinkSync } from "node:fs";
import { isErrnoException } from "./lib/errors";
import { runLifecycleSweep } from "./lib/lifecycle";
import { loadLifecycleConfig } from "./lib/lifecycle-config";
import { acquireLifecycleDaemonLock } from "./lib/lifecycle-lock";
import { logger } from "./lib/logger";
import { LIFECYCLE_PID_PATH } from "./lib/paths";

function cleanupOwnedPidFile(): void {
  try {
    const recordedPid = Number.parseInt(readFileSync(LIFECYCLE_PID_PATH, "utf8").trim(), 10);
    if (recordedPid === process.pid) {
      unlinkSync(LIFECYCLE_PID_PATH);
    }
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Could not remove lifecycle PID file: ${message}`);
    }
  }
}

function exitDaemon(): never {
  cleanupOwnedPidFile();
  process.exit(0);
}

async function shouldExitBecauseUnused(): Promise<boolean> {
  const daemonLock = await acquireLifecycleDaemonLock();
  try {
    const latestConfig = await loadLifecycleConfig();
    if (!latestConfig.ok || Object.keys(latestConfig.value.environments).length > 0) {
      return false;
    }
    // Publish that this daemon is exiting before a concurrent start checks the PID.
    cleanupOwnedPidFile();
    return true;
  } finally {
    await daemonLock.release();
  }
}

process.on("SIGTERM", () => {
  exitDaemon();
});
process.on("SIGINT", () => {
  exitDaemon();
});

while (true) {
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    logger.error(configResult.error.message);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    continue;
  }
  if (Object.keys(configResult.value.environments).length === 0) {
    if (await shouldExitBecauseUnused()) {
      process.exit(0);
    }
  }

  const result = await runLifecycleSweep();
  if (!result.ok) {
    logger.error(result.error.message);
  }
  await new Promise((resolve) =>
    setTimeout(resolve, configResult.value.scanIntervalSeconds * 1000)
  );
}
