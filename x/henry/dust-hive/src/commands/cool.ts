import { withEnvironment } from "../lib/commands";
import { pauseDocker } from "../lib/docker";
import { logger } from "../lib/logger";
import { stopService } from "../lib/process";
import { CommandError, Err, Ok } from "../lib/result";
import { ALL_SERVICES } from "../lib/services";
import { getStateInfo } from "../lib/state";

export const coolCommand = withEnvironment("cool", async (env) => {
  // Check state
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "warm") {
    return Err(new CommandError(`Environment is ${stateInfo.state}, not warm. Nothing to cool.`));
  }

  logger.info(`Cooling environment '${env.name}'...`);
  console.log();

  // Stop all services except SDK
  logger.step("Stopping services...");
  for (const service of ALL_SERVICES.filter((s) => s !== "sdk")) {
    const stopped = await stopService(env.name, service);
    if (stopped) {
      logger.info(`  Stopped ${service}`);
    }
  }
  logger.success("Services stopped");

  // Pause Docker (stop without removing containers for faster restart)
  const dockerPaused = await pauseDocker(env.name);
  if (!dockerPaused) {
    logger.warn("Docker containers may need manual cleanup");
  }

  console.log();
  logger.success(`Environment '${env.name}' is now cold (SDK still running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${env.name}    # Re-warm the environment`);
  console.log(`  dust-hive stop ${env.name}    # Full stop (including SDK)`);
  console.log();

  return Ok(undefined);
});
