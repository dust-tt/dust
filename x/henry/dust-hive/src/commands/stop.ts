import { requireEnvironment } from "../lib/commands";
import { stopDocker } from "../lib/docker";
import { logger } from "../lib/logger";
import { stopAllServices } from "../lib/process";
import { Ok, type Result } from "../lib/result";
import { getStateInfo, isDockerRunning } from "../lib/state";

export async function stopCommand(args: string[]): Promise<Result<void>> {
  const envResult = await requireEnvironment(args[0], "stop");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  const name = env.name;

  // Check state
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state === "stopped") {
    logger.info("Environment is already stopped.");
    return Ok(undefined);
  }

  logger.info(`Stopping environment '${name}'...`);
  console.log();

  // Stop all services (including SDK)
  logger.step("Stopping all services...");
  await stopAllServices(name);
  logger.success("All services stopped");

  // Stop Docker if running
  const dockerRunning = await isDockerRunning(name);
  if (dockerRunning) {
    const dockerStopped = await stopDocker(name, env.metadata.repoRoot);
    if (!dockerStopped) {
      logger.warn("Docker containers may need manual cleanup");
    }
  }

  console.log();
  logger.success(`Environment '${name}' is now stopped`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive start ${name}   # Resume (start SDK watch)`);
  console.log(`  dust-hive destroy ${name} # Remove environment`);
  console.log();

  return Ok(undefined);
}
