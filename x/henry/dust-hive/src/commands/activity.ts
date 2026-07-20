import { detectEnvironmentFromCwd, getEnvironment } from "../lib/environment";
import { touchLifecycleActivity, withLifecycleActivityLease } from "../lib/lifecycle-activity";
import { CommandError, Err, Ok, type Result } from "../lib/result";

async function resolveActivityEnvironment(nameArg?: string): Promise<Result<string, CommandError>> {
  const name = nameArg ?? process.env["DUST_HIVE_ENV_NAME"] ?? (await detectEnvironmentFromCwd());
  if (!name) {
    return Err(new CommandError("Could not determine the Hive environment"));
  }
  if (!(await getEnvironment(name))) {
    return Err(new CommandError(`Environment '${name}' not found`));
  }
  return Ok(name);
}

export async function activityTouchCommand(nameArg?: string): Promise<Result<void>> {
  const envResult = await resolveActivityEnvironment(nameArg);
  if (!envResult.ok) {
    return envResult;
  }
  await touchLifecycleActivity(envResult.value, "command");
  return Ok(undefined);
}

export async function activityRunCommand(command: string[]): Promise<Result<void>> {
  if (command.length === 0) {
    return Err(new CommandError("Usage: dust-hive activity run -- <command>"));
  }
  const envResult = await resolveActivityEnvironment();
  if (!envResult.ok) {
    return envResult;
  }

  const exitCode = await withLifecycleActivityLease(envResult.value, "test", async () => {
    const proc = Bun.spawn(command, {
      cwd: process.cwd(),
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    return proc.exited;
  });
  if (exitCode !== 0) {
    return Err(new CommandError(`Command exited with code ${exitCode}`));
  }
  return Ok(undefined);
}
