import { detectEnvironmentFromCwd, getEnvironment } from "../lib/environment";
import { touchLifecycleActivity } from "../lib/lifecycle-activity";
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

  await touchLifecycleActivity(envResult.value, "test");
  const proc = Bun.spawn(command, {
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exited = proc.exited;
  const heartbeat = async (): Promise<void> => {
    while (true) {
      const shouldContinue = await Promise.race([
        exited.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 15_000)),
      ]);
      if (!shouldContinue) {
        return;
      }
      await touchLifecycleActivity(envResult.value, "test");
    }
  };
  const heartbeatPromise = heartbeat();
  const exitCode = await exited;
  await heartbeatPromise;
  await touchLifecycleActivity(envResult.value, "test");
  if (exitCode !== 0) {
    return Err(new CommandError(`Command exited with code ${exitCode}`));
  }
  return Ok(undefined);
}
