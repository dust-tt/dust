import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { isServiceRunning } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
import { Ok } from "../lib/result";
import { COLD_STATE_SERVICES } from "../lib/services";
import { getStateInfo } from "../lib/state";

export const startCommand = withEnvironment("start", async (env) => {
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "stopped") {
    if (stateInfo.state === "cold") {
      logger.info("Environment is already cold (SDK running). Use 'warm' to start services.");
      return Ok(undefined);
    }
    logger.info("Environment is already warm.");
    return Ok(undefined);
  }

  logger.info(`Starting environment '${env.name}'...`);
  console.log();

  // Start build watchers (sparkle and SDK) using registry
  const servicesToStart: (typeof COLD_STATE_SERVICES)[number][] = [];
  for (const service of COLD_STATE_SERVICES) {
    const running = await isServiceRunning(env.name, service);
    if (!running) {
      servicesToStart.push(service);
    } else {
      logger.info(`${service} watch already running`);
    }
  }

  if (servicesToStart.length > 0) {
    await Promise.all(servicesToStart.map((s) => startService(env, s)));
    await Promise.all(servicesToStart.map((s) => waitForServiceReady(env, s)));
  }

  console.log();
  logger.success(`Environment '${env.name}' is now cold (sparkle and SDK running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${env.name}    # Start all services`);
  console.log(`  dust-hive open ${env.name}    # Open terminal session`);
  console.log();

  return Ok(undefined);
});
