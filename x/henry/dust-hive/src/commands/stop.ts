import { withEnvironment } from "../lib/commands";
import { stopDocker } from "../lib/docker";
import type { Environment } from "../lib/environment";
import { logger } from "../lib/logger";
import { stopAllServices, stopService } from "../lib/process";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ALL_SERVICES, isServiceName } from "../lib/services";
import { getStateInfo } from "../lib/state";

export async function stopEnvironment(env: Environment, service?: string): Promise<Result<void>> {
  // If a service is specified, stop just that service
  if (service !== undefined) {
    if (!isServiceName(service)) {
      console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
      return Err(new CommandError(`Unknown service '${service}'`));
    }

    logger.info(`Stopping ${service} in '${env.name}'...`);
    const stopped = await stopService(env.name, service);
    if (stopped) {
      logger.success(`${service} stopped`);
    } else {
      logger.info(`${service} was not running`);
    }
    return Ok(undefined);
  }

  // No service specified - stop everything
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state === "stopped") {
    logger.info("Environment is already stopped.");
    return Ok(undefined);
  }

  logger.info(`Stopping environment '${env.name}'...`);
  console.log();

  // Stop all services (including SDK)
  logger.step("Stopping all services...");
  await stopAllServices(env.name);
  logger.success("All services stopped");

  // Remove containers even after cool stopped them.
  const dockerStopped = await stopDocker(env.name);
  if (!dockerStopped) {
    logger.warn("Docker containers may need manual cleanup");
  }

  console.log();
  logger.success(`Environment '${env.name}' is now stopped`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive start ${env.name}   # Resume (start SDK watch)`);
  console.log(`  dust-hive destroy ${env.name} # Remove environment`);
  console.log();

  return Ok(undefined);
}

export const stopCommand = withEnvironment("stop", stopEnvironment);
