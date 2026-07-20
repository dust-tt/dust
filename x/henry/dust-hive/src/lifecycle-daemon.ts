#!/usr/bin/env bun

import { unlinkSync } from "node:fs";
import { isErrnoException } from "./lib/errors";
import { runLifecycleSweep } from "./lib/lifecycle";
import { loadLifecycleConfig } from "./lib/lifecycle-config";
import { logger } from "./lib/logger";
import { LIFECYCLE_PID_PATH } from "./lib/paths";

function exitDaemon(): never {
  try {
    unlinkSync(LIFECYCLE_PID_PATH);
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Could not remove lifecycle PID file: ${message}`);
    }
  }
  process.exit(0);
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
    exitDaemon();
  }

  const result = await runLifecycleSweep();
  if (!result.ok) {
    logger.error(result.error.message);
  }
  await new Promise((resolve) =>
    setTimeout(resolve, configResult.value.scanIntervalSeconds * 1000)
  );
}
