import { requireEnvironment } from "../lib/commands";
import { getLogPath } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";

function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}

export async function logsCommand(args: string[]): Promise<Result<void>> {
  const name = args[0];
  const serviceArg = args[1];
  const follow = args.includes("-f") || args.includes("--follow");

  if (!name) {
    console.log(`\nServices: ${ALL_SERVICES.join(", ")}`);
    return Err(new CommandError("Usage: dust-hive logs NAME [SERVICE] [-f]"));
  }

  const envResult = await requireEnvironment(name, "logs");
  if (!envResult.ok) return envResult;
  const env = envResult.value;

  // If no service specified or invalid, show front by default
  const targetService: ServiceName = isServiceName(serviceArg) ? serviceArg : "front";
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
