import {
  type EnvironmentNameArg,
  normalizeEnvironmentNames,
  requireEnvironment,
  withEnvironments,
} from "../lib/commands";
import { stopDocker } from "../lib/docker";
import { type Environment, getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { stopAllServices, stopService } from "../lib/process";
import { CommandError, Err, Ok } from "../lib/result";
import { ALL_SERVICES, isServiceName } from "../lib/services";
import { getStateInfo, isDockerRunning } from "../lib/state";

async function stopEnvironment(env: Environment) {
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

  // Stop Docker if running
  const dockerRunning = await isDockerRunning(env.name);
  if (dockerRunning) {
    const dockerStopped = await stopDocker(env.name);
    if (!dockerStopped) {
      logger.warn("Docker containers may need manual cleanup");
    }
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

const stopEnvironments = withEnvironments("stop", stopEnvironment);

export async function stopCommand(targets: EnvironmentNameArg) {
  const names = normalizeEnvironmentNames(targets);
  const [name, service] = names;

  // Preserve the existing `dust-hive stop <env> <service>` form. Any other
  // multi-arg invocation is treated as a list of environments to stop.
  if (names.length === 2 && name !== undefined && isServiceName(service)) {
    const envResult = await requireEnvironment(name, "stop");
    if (!envResult.ok) return envResult;

    logger.info(`Stopping ${service} in '${envResult.value.name}'...`);
    const stopped = await stopService(envResult.value.name, service);
    if (stopped) {
      logger.success(`${service} stopped`);
    } else {
      logger.info(`${service} was not running`);
    }
    return Ok(undefined);
  }

  if (names.length === 2 && name !== undefined && service !== undefined) {
    const envResult = await requireEnvironment(name, "stop");
    if (!envResult.ok) return envResult;

    const secondEnv = await getEnvironment(service);
    if (!secondEnv) {
      console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
      return Err(new CommandError(`Unknown service '${service}'`));
    }
  }

  return stopEnvironments(targets);
}
