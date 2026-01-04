import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { stopService, waitForSdkBuild } from "../lib/process";
import { startService, waitForServiceHealth } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";

function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}

export async function restartCommand(args: string[]): Promise<Result<void>> {
  const name = args[0];
  const serviceArg = args[1];

  if (!name) {
    console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
    return Err(new CommandError("Usage: dust-hive restart NAME SERVICE"));
  }

  if (!serviceArg || !isServiceName(serviceArg)) {
    console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
    return Err(new CommandError(`Unknown service '${serviceArg ?? ""}'`));
  }

  const envResult = await requireEnvironment(name, "restart");
  if (!envResult.ok) return envResult;
  const env = envResult.value;

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
}
