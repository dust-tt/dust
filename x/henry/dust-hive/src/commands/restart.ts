import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { stopService } from "../lib/process";
import { startService, waitForServiceReady } from "../lib/registry";
import { CommandError, Err, Ok } from "../lib/result";
import { ALL_SERVICES, isServiceName } from "../lib/services";

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
  await waitForServiceReady(env, serviceArg);

  logger.success(`${serviceArg} restarted`);

  return Ok(undefined);
});
