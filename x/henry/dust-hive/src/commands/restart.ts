import * as p from "@clack/prompts";
import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { stopService } from "../lib/process";
import { restoreTerminal } from "../lib/prompt";
import { startService, waitForServiceReady } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ALL_SERVICES, type ServiceName, isServiceName } from "../lib/services";

async function selectService(): Promise<ServiceName | null> {
  const result = await p.select({
    message: "Select service to restart",
    options: ALL_SERVICES.map((name) => ({ value: name, label: name })),
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result;
}

export async function restartCommand(
  nameArg: string | undefined,
  serviceArg: string | undefined
): Promise<Result<void>> {
  // Skip restoreTerminal if we need interactive service selection after
  const skipRestore = !serviceArg;
  const envResult = await requireEnvironment(nameArg, "restart", {
    skipRestoreTerminal: skipRestore,
  });
  if (!envResult.ok) return envResult;

  const env = envResult.value;

  // Handle service selection
  let service: ServiceName;
  if (serviceArg) {
    // Service provided via CLI argument
    if (!isServiceName(serviceArg)) {
      console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
      return Err(new CommandError(`Unknown service '${serviceArg}'`));
    }
    service = serviceArg;
  } else {
    // Interactive selection
    const selected = await selectService();
    if (!selected) {
      return Err(new CommandError("No service selected"));
    }
    service = selected;
  }

  // Restore terminal after all interactive prompts are done
  restoreTerminal();

  logger.info(`Restarting ${service} in '${env.name}'...`);

  const stopped = await stopService(env.name, service);
  if (!stopped) {
    logger.info(`${service} was not running`);
  }

  await startService(env, service);
  await waitForServiceReady(env, service);

  logger.success(`${service} restarted`);

  return Ok(undefined);
}
