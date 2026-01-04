import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { isServiceRunning, waitForSdkBuild } from "../lib/process";
import { startService } from "../lib/registry";
import { Ok, type Result } from "../lib/result";
import { getStateInfo } from "../lib/state";

export async function startCommand(nameArg: string | undefined): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "start");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  const name = env.name;

  // Check state
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "stopped") {
    if (stateInfo.state === "cold") {
      logger.info("Environment is already cold (SDK running). Use 'warm' to start services.");
      return Ok(undefined);
    }
    logger.info("Environment is already warm.");
    return Ok(undefined);
  }

  logger.info(`Starting environment '${name}'...`);
  console.log();

  // Start SDK watch using registry
  if (!(await isServiceRunning(name, "sdk"))) {
    await startService(env, "sdk");
    await waitForSdkBuild(name);
  } else {
    logger.info("SDK watch already running");
  }

  console.log();
  logger.success(`Environment '${name}' is now cold (SDK running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}    # Start all services`);
  console.log(`  dust-hive open ${name}    # Open zellij session`);
  console.log();

  return Ok(undefined);
}
