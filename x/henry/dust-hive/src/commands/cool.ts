import { requireEnvironment } from "../lib/commands";
import { stopDocker } from "../lib/docker";
import { logger } from "../lib/logger";
import { stopService } from "../lib/process";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ALL_SERVICES } from "../lib/services";
import { getStateInfo } from "../lib/state";

export async function coolCommand(args: string[]): Promise<Result<void>> {
  const envResult = await requireEnvironment(args[0], "cool");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  const name = env.name;

  // Check state
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "warm") {
    return Err(new CommandError(`Environment is ${stateInfo.state}, not warm. Nothing to cool.`));
  }

  logger.info(`Cooling environment '${name}'...`);
  console.log();

  // Stop all services except SDK
  logger.step("Stopping services...");
  for (const service of ALL_SERVICES.filter((s) => s !== "sdk")) {
    const stopped = await stopService(name, service);
    if (stopped) {
      logger.info(`  Stopped ${service}`);
    }
  }
  logger.success("Services stopped");

  // Stop Docker
  const dockerStopped = await stopDocker(name, env.metadata.repoRoot);
  if (!dockerStopped) {
    logger.warn("Docker containers may need manual cleanup");
  }

  console.log();
  logger.success(`Environment '${name}' is now cold (SDK still running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}    # Re-warm the environment`);
  console.log(`  dust-hive stop ${name}    # Full stop (including SDK)`);
  console.log();

  return Ok(undefined);
}
