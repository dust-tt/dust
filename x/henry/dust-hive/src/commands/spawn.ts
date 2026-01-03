import { writeDockerComposeOverride } from "../lib/docker";
import { writeEnvSh } from "../lib/envgen";
import {
  type EnvironmentMetadata,
  createEnvironment,
  environmentExists,
  validateEnvName,
} from "../lib/environment";
import { logger } from "../lib/logger";
import { findRepoRoot, getWorktreeDir } from "../lib/paths";
import { allocateNextPort, calculatePorts, savePortAllocation } from "../lib/ports";
import { spawnShellDaemon } from "../lib/process";

interface SpawnOptions {
  name?: string;
  base?: string;
  noOpen?: boolean;
}

function parseArgs(args: string[]): SpawnOptions {
  const options: SpawnOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--name" && nextArg !== undefined) {
      options.name = nextArg;
      i++;
    } else if (arg === "--base" && nextArg !== undefined) {
      options.base = nextArg;
      i++;
    } else if (arg === "--no-open") {
      options.noOpen = true;
    } else if (arg !== undefined && !arg.startsWith("-")) {
      options.name = arg;
    }
  }

  return options;
}

async function promptForName(): Promise<string> {
  process.stdout.write("Environment name: ");

  for await (const line of console) {
    const name = line.trim();
    const validation = validateEnvName(name);
    if (!validation.valid) {
      logger.error(validation.error ?? "Invalid name");
      process.stdout.write("Environment name: ");
      continue;
    }
    return name;
  }

  throw new Error("No input received");
}

async function getCurrentBranch(repoRoot: string): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim();
}

async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  branchName: string,
  baseBranch: string
): Promise<void> {
  logger.step(`Creating worktree at ${worktreePath}`);

  const proc = Bun.spawn(["git", "worktree", "add", worktreePath, "-b", branchName, baseBranch], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to create worktree: ${stderr}`);
  }
}

async function runNpmCi(cwd: string, name: string): Promise<void> {
  logger.step(`Installing dependencies in ${name}...`);

  const proc = Bun.spawn(["bash", "-c", "source ~/.nvm/nvm.sh && nvm use && npm ci"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`npm ci failed in ${name}`);
  }
}

async function startSdkWatch(envName: string, worktreePath: string): Promise<void> {
  logger.step("Starting SDK watch...");

  const sdkPath = `${worktreePath}/sdks/js`;
  const command = `
    source ~/.nvm/nvm.sh && nvm use
    npm run dev
  `;

  await spawnShellDaemon(envName, "sdk", command, { cwd: sdkPath });
}

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

export async function spawnCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);

  // Find repo root
  const repoRoot = await findRepoRoot();
  if (!repoRoot) {
    logger.error("Not in a git repository. Please run from within the Dust repo.");
    process.exit(1);
  }

  // Get or prompt for name
  let name = options.name;
  if (!name) {
    name = await promptForName();
  }

  // Validate name
  const validation = validateEnvName(name);
  if (!validation.valid) {
    logger.error(validation.error ?? "Invalid environment name");
    process.exit(1);
  }

  // Check if already exists
  if (await environmentExists(name)) {
    logger.error(`Environment '${name}' already exists`);
    process.exit(1);
  }

  // Get base branch
  const baseBranch = options.base ?? (await getCurrentBranch(repoRoot));
  const workspaceBranch = `${name}-workspace`;

  logger.info(`Creating environment '${name}' from branch '${baseBranch}'`);

  // Allocate ports
  const basePort = await allocateNextPort();
  const ports = calculatePorts(basePort);
  logger.step(`Allocated ports ${ports.base}-${ports.base + 999}`);

  // Create environment metadata
  const metadata: EnvironmentMetadata = {
    name,
    baseBranch,
    workspaceBranch,
    createdAt: new Date().toISOString(),
    repoRoot,
  };

  // Create environment directory and files
  await createEnvironment(metadata);
  await savePortAllocation(name, ports);
  await writeEnvSh(name, ports);
  await writeDockerComposeOverride(name, ports);

  // Create worktree
  const worktreePath = getWorktreeDir(name);
  await createWorktree(repoRoot, worktreePath, workspaceBranch, baseBranch);

  // Install dependencies
  await runNpmCi(`${worktreePath}/sdks/js`, "sdks/js");
  await runNpmCi(`${worktreePath}/front`, "front");
  await runNpmCi(`${worktreePath}/connectors`, "connectors");

  // Start SDK watch
  await startSdkWatch(name, worktreePath);
  await waitForSdkBuild(worktreePath);

  logger.success(`Environment '${name}' created successfully!`);
  console.log();
  console.log(`  Worktree: ${worktreePath}`);
  console.log(`  Branch:   ${workspaceBranch}`);
  console.log(`  Ports:    ${ports.base}-${ports.base + 999}`);
  console.log();
  console.log("Next steps:");
  console.log(`  dust-hive warm ${name}    # Start all services`);
  console.log(`  dust-hive open ${name}    # Open zellij session`);
  console.log();

  // Open zellij unless --no-open
  if (!options.noOpen) {
    // TODO: Implement open command and call it here
    logger.info("(--no-open was not specified, but open command is not yet implemented)");
  }
}
