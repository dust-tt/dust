import { withEnvironment } from "../lib/commands";
import { getLogPath } from "../lib/paths";
import { CommandError, Err, Ok } from "../lib/result";
import { ALL_SERVICES, type ServiceName, isServiceName } from "../lib/services";

interface LogsOptions {
  follow?: boolean;
}

export const logsCommand = withEnvironment(
  "logs",
  async (env, serviceArg: string | undefined, options: LogsOptions) => {
    const follow = options.follow ?? false;

    // If no service specified, show front by default
    let targetService: ServiceName = "front";
    if (serviceArg) {
      if (!isServiceName(serviceArg)) {
        console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
        return Err(new CommandError(`Unknown service '${serviceArg}'`));
      }
      targetService = serviceArg;
    }
    const logPath = getLogPath(env.name, targetService);

    const logFile = Bun.file(logPath);
    if (!(await logFile.exists())) {
      return Err(new CommandError(`No log file for ${targetService}`));
    }

    if (follow) {
      const proc = Bun.spawn(["tail", "-F", logPath], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    } else {
      const proc = Bun.spawn(["tail", "-500", logPath], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    }

    return Ok(undefined);
  }
);
