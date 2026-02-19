import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { withEnvironment } from "../lib/commands";
import { getLogPath } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ensureServiceLogsTui } from "../lib/scripts";
import { ALL_SERVICES, type ServiceName, isServiceName } from "../lib/services";

interface LogsOptions {
  follow?: boolean;
  interactive?: boolean;
}

function validateServiceArg(serviceArg: string): Result<ServiceName, CommandError> {
  if (!isServiceName(serviceArg)) {
    console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
    return Err(new CommandError(`Unknown service '${serviceArg}'`));
  }
  return Ok(serviceArg);
}

async function runInteractiveMode(
  envName: string,
  serviceArg: string | undefined
): Promise<Result<undefined, CommandError>> {
  if (serviceArg) {
    const result = validateServiceArg(serviceArg);
    if (!result.ok) return result;
  }
  const scriptPath = await ensureServiceLogsTui();
  const args = serviceArg ? [scriptPath, envName, serviceArg] : [scriptPath, envName];
  const proc = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
  return Ok(undefined);
}

async function ensureLogFileExists(logPath: string): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  await Bun.write(logPath, "");
}

export const logsCommand = withEnvironment(
  "logs",
  async (env, serviceArg: string | undefined, options: LogsOptions) => {
    const follow = options.follow ?? false;
    const interactive = options.interactive ?? false;

    if (interactive) {
      return runInteractiveMode(env.name, serviceArg);
    }

    // Determine target service (default to front)
    let targetService: ServiceName = "front";
    if (serviceArg) {
      const result = validateServiceArg(serviceArg);
      if (!result.ok) return result;
      targetService = result.value;
    }

    const logPath = getLogPath(env.name, targetService);
    const exists = await Bun.file(logPath).exists();

    if (follow) {
      if (!exists) {
        await ensureLogFileExists(logPath);
      }
      const proc = Bun.spawn(["tail", "-F", logPath], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    } else {
      if (!exists) {
        return Err(new CommandError(`No log file for ${targetService}`));
      }
      const proc = Bun.spawn(["tail", "-500", logPath], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    }

    return Ok(undefined);
  }
);
