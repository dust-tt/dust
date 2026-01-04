// Environment setup operations

import { logger } from "./logger";
import { buildShell } from "./shell";

// Run npm ci in a directory
export async function runNpmCi(cwd: string, name: string): Promise<void> {
  logger.step(`Installing dependencies in ${name}...`);

  const command = buildShell({
    sourceNvm: true,
    run: "npm ci",
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`npm ci failed in ${name}`);
  }

  logger.success(`Dependencies installed in ${name}`);
}

// Install all dependencies for a worktree
export async function installAllDependencies(worktreePath: string): Promise<void> {
  await runNpmCi(`${worktreePath}/sdks/js`, "sdks/js");
  await runNpmCi(`${worktreePath}/front`, "front");
  await runNpmCi(`${worktreePath}/connectors`, "connectors");
}
