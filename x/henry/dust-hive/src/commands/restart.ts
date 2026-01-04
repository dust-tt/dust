import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { stopService, waitForSdkBuild } from "../lib/process";
import { startService, waitForServiceHealth } from "../lib/registry";
import { CommandError, Err, Ok } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";

function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}

export const restartCommand = withEnvironment("restart", async (env, serviceArg: string) => {
  if (!isServiceName(serviceArg)) {
    console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
    return Err(new CommandError(`Unknown service '${serviceArg ?? ""}'`));
  }

  logger.info(`Restarting ${serviceArg} in '${env.name}'...`);

  const stopped = await stopService(env.name, serviceArg);
  if (!stopped) {
    logger.info(`${serviceArg} was not running`);
  }

  await startService(env, serviceArg);

  if (serviceArg === "sdk") {
    await waitForSdkBuild(env.name);
  } else {
    await waitForServiceHealth(serviceArg, env.ports);
  }

  logger.success(`${serviceArg} restarted`);

  return Ok(undefined);
});
