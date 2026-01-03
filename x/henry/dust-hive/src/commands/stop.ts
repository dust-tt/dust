import { getDockerProjectName } from "../lib/docker";
import { getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { getDockerOverridePath } from "../lib/paths";
import { stopAllServices } from "../lib/process";
import { getStateInfo, isDockerRunning } from "../lib/state";

// Stop docker-compose
async function stopDocker(envName: string, repoRoot: string): Promise<void> {
  logger.step("Stopping Docker containers...");

  const projectName = getDockerProjectName(envName);
  const overridePath = getDockerOverridePath(envName);
  const basePath = `${repoRoot}/tools/docker-compose.dust-hive.yml`;

  const proc = Bun.spawn(
    ["docker", "compose", "-f", basePath, "-f", overridePath, "-p", projectName, "down"],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  await proc.exited;

  if (proc.exitCode === 0) {
    logger.success("Docker containers stopped");
  } else {
    logger.warn("Docker containers may not have stopped cleanly");
  }
}

export async function stopCommand(args: string[]): Promise<void> {
  const name = args[0];

  if (!name) {
    logger.error("Usage: dust-hive stop NAME");
    process.exit(1);
  }

  // Get environment
  const env = await getEnvironment(name);
  if (!env) {
    logger.error(`Environment '${name}' not found`);
    process.exit(1);
  }

  // Check state
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state === "stopped") {
    logger.info("Environment is already stopped.");
    return;
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
    await stopDocker(name, env.metadata.repoRoot);
  }

  console.log();
  logger.success(`Environment '${name}' is now stopped`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive start ${name}   # Resume (start SDK watch)`);
  console.log(`  dust-hive destroy ${name} # Remove environment`);
  console.log();
}
