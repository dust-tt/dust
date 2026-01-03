import { getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { isServiceRunning, spawnShellDaemon } from "../lib/process";
import { getStateInfo } from "../lib/state";

// Wait for SDK build
async function waitForSdkBuild(worktreePath: string, timeoutMs = 120000): Promise<void> {
  logger.step("Waiting for SDK to build...");

  const targetFile = `${worktreePath}/sdks/js/dist/client.esm.js`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const file = Bun.file(targetFile);
    if (await file.exists()) {
      logger.success("SDK build complete");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("SDK build timed out");
}

export async function startCommand(args: string[]): Promise<void> {
  const name = args[0];

  if (!name) {
    logger.error("Usage: dust-hive start NAME");
    process.exit(1);
  }

  // Get environment
  const env = await getEnvironment(name);
  if (!env) {
    logger.error(`Environment '${name}' not found`);
    process.exit(1);
  }

  // Check state
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "stopped") {
    if (stateInfo.state === "cold") {
      logger.info("Environment is already cold (SDK running). Use 'warm' to start services.");
      return;
    }
    logger.info("Environment is already warm.");
    return;
  }

  logger.info(`Starting environment '${name}'...`);
  console.log();

  // Start SDK watch
  const worktreePath = getWorktreeDir(name);

  if (!(await isServiceRunning(name, "sdk"))) {
    logger.step("Starting SDK watch...");

    const sdkPath = `${worktreePath}/sdks/js`;
    const command = `
      source ~/.nvm/nvm.sh && nvm use
      npm run dev
    `;

    await spawnShellDaemon(name, "sdk", command, { cwd: sdkPath });
    logger.success("SDK watch started");

    // Wait for build
    await waitForSdkBuild(worktreePath);
  } else {
    logger.info("SDK watch already running");
  }

  console.log();
  logger.success(`Environment '${name}' is now cold (SDK running)`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}    # Start all services`);
  console.log(`  dust-hive open ${name}    # Open zellij session`);
  console.log();
}
