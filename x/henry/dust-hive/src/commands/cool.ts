import { getDockerProjectName } from "../lib/docker";
import { getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { getDockerOverridePath } from "../lib/paths";
import { APP_SERVICES, stopService } from "../lib/process";
import { getStateInfo } from "../lib/state";

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

export async function coolCommand(args: string[]): Promise<void> {
  const name = args[0];

  if (!name) {
    logger.error("Usage: dust-hive cool NAME");
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
  if (stateInfo.state !== "warm") {
    logger.error(`Environment is ${stateInfo.state}, not warm. Nothing to cool.`);
    process.exit(1);
  }

  logger.info(`Cooling environment '${name}'...`);
  console.log();

  // Stop app services (but not SDK)
  logger.step("Stopping app services...");
  for (const service of APP_SERVICES) {
    const stopped = await stopService(name, service);
    if (stopped) {
      logger.info(`  Stopped ${service}`);
    }
  }
  logger.success("App services stopped");

  // Stop Docker
  await stopDocker(name, env.metadata.repoRoot);

  console.log();
  logger.success(`Environment '${name}' is now cold (SDK still running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}    # Re-warm the environment`);
  console.log(`  dust-hive stop ${name}    # Full stop (including SDK)`);
  console.log();
}
