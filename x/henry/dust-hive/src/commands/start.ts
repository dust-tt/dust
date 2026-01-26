import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { isServiceRunning } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
import { Ok } from "../lib/result";
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
  const sparkleRunning = await isServiceRunning(env.name, "sparkle");
  const sdkRunning = await isServiceRunning(env.name, "sdk");

  const startPromises: Promise<void>[] = [];
  if (!sparkleRunning) {
    startPromises.push(startService(env, "sparkle"));
  } else {
    logger.info("Sparkle watch already running");
  }
  if (!sdkRunning) {
    startPromises.push(startService(env, "sdk"));
  } else {
    logger.info("SDK watch already running");
  }

  if (startPromises.length > 0) {
    await Promise.all(startPromises);
    // Wait for both to be ready
    const readyPromises: Promise<void>[] = [];
    if (!sparkleRunning) readyPromises.push(waitForServiceReady(env, "sparkle"));
    if (!sdkRunning) readyPromises.push(waitForServiceReady(env, "sdk"));
    await Promise.all(readyPromises);
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
