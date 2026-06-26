import { withEnvironments } from "../lib/commands";
import { logger } from "../lib/logger";
import { stopService } from "../lib/process";
import { isServiceRunningForEnvironment, startService, waitForServiceReady } from "../lib/registry";
import { Ok } from "../lib/result";
import { COLD_STATE_SERVICES } from "../lib/services";
import { repairEnvironmentSetup } from "../lib/setup";
import { getStateInfo } from "../lib/state";

export const startCommand = withEnvironments("start", async (env) => {
  const repair = await repairEnvironmentSetup(env.metadata);
  if (repair.repairedArtifacts.length > 0) {
    logger.warn(`Repaired worktree setup: ${repair.repairedArtifacts.join(", ")}`);
  }

  if (repair.dependenciesRepaired) {
    await Promise.all(COLD_STATE_SERVICES.map((service) => stopService(env.name, service)));
  }

  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "stopped") {
    if (stateInfo.state === "cold") {
      await Promise.all(COLD_STATE_SERVICES.map((s) => waitForServiceReady(env, s)));
      logger.info(
        "Environment is already cold (SDK and Sparkle running). Use 'warm' to start services."
      );
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
    const running = await isServiceRunningForEnvironment(env, service);
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
