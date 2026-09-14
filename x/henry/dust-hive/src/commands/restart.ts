import * as p from "@clack/prompts";
import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { stopService } from "../lib/process";
import { restoreTerminal } from "../lib/prompt";
import { startService, waitForServiceReady } from "../lib/registry";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ALL_SERVICES, resolveServices, SERVICE_ALIASES, type ServiceName } from "../lib/services";

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
  let services: readonly ServiceName[];
  if (serviceArg) {
    // Service or alias provided via CLI argument
    const resolved = resolveServices(serviceArg);
    if (!resolved) {
      console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
      console.log(`Aliases: ${Object.keys(SERVICE_ALIASES).join(", ")}`);
      return Err(new CommandError(`Unknown service '${serviceArg}'`));
    }
    services = resolved;
  } else {
    // Interactive selection
    const selected = await selectService();
    if (!selected) {
      return Err(new CommandError("No service selected"));
    }
    services = [selected];
  }

  // Restore terminal after all interactive prompts are done
  restoreTerminal();

  for (const service of services) {
    logger.info(`Restarting ${service} in '${env.name}'...`);

    const stopped = await stopService(env.name, service);
    if (!stopped) {
      logger.info(`${service} was not running`);
    }

    await startService(env, service);
    await waitForServiceReady(env, service);

    logger.success(`${service} restarted`);
  }

  return Ok(undefined);
}
