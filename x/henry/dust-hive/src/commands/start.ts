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

  // Start SDK watch using registry
  if (!(await isServiceRunning(env.name, "sdk"))) {
    await startService(env, "sdk");
    await waitForServiceReady(env, "sdk");
  } else {
    logger.info("SDK watch already running");
  }

  console.log();
  logger.success(`Environment '${env.name}' is now cold (SDK running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${env.name}    # Start all services`);
  console.log(`  dust-hive open ${env.name}    # Open zellij session`);
  console.log();

  return Ok(undefined);
});
