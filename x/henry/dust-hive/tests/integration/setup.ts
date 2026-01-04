/**
 * Integration test infrastructure
 *
 * Provides isolated test contexts with guaranteed cleanup.
 */

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Counter for unique test names
let testCounter = 0;

/**
 * Test context providing isolated directories for each test
 */
export interface TestContext {
  /** Unique name for this test environment */
  envName: string;
  /** Temp directory for test files */
  tempDir: string;
  /** Cleanup function - call in afterEach */
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated test context
 */
export async function createTestContext(prefix = "int"): Promise<TestContext> {
  const timestamp = Date.now();
  const counter = ++testCounter;
  const envName = `${prefix}-${timestamp}-${counter}`;
  const tempDir = join(tmpdir(), `dust-hive-test-${envName}`);

  await mkdir(tempDir, { recursive: true });

  return {
    envName,
    tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  const proc = Bun.spawn(["docker", "info"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

/**
 * Require Docker to be available, fail test if not
 */
export async function requireDocker(): Promise<void> {
  if (!(await isDockerAvailable())) {
    throw new Error("Docker is required for integration tests. Please start Docker and try again.");
  }
}

/**
 * Check if we're in a git repo
 */
export async function isInGitRepo(path: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
    cwd: path,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

/**
 * Create a minimal git repo for testing
 */
export async function createTestGitRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true });

  // Initialize git repo
  await runGit(path, ["init"]);
  await runGit(path, ["config", "user.email", "test@test.local"]);
  await runGit(path, ["config", "user.name", "Test User"]);

  // Create minimal dust-hive structure
  await mkdir(join(path, "sdks/js/dist"), { recursive: true });
  await mkdir(join(path, "front"), { recursive: true });
  await mkdir(join(path, "core"), { recursive: true });
  await mkdir(join(path, "connectors"), { recursive: true });
  await mkdir(join(path, "tools"), { recursive: true });

  // Create package.json files
  await Bun.write(
    join(path, "sdks/js/package.json"),
    JSON.stringify({ name: "@dust/client", version: "0.0.1" })
  );
  await Bun.write(
    join(path, "front/package.json"),
    JSON.stringify({ name: "front", version: "0.0.1" })
  );
  await Bun.write(
    join(path, "connectors/package.json"),
    JSON.stringify({ name: "connectors", version: "0.0.1" })
  );
  await Bun.write(join(path, "package.json"), JSON.stringify({ name: "dust", version: "0.0.1" }));

  // Create placeholder SDK dist file (so build check passes)
  await Bun.write(join(path, "sdks/js/dist/client.esm.js"), "// placeholder");

  // Initial commit
  await runGit(path, ["add", "."]);
  await runGit(path, ["commit", "-m", "Initial commit"]);
}

/**
 * Run a git command and throw on failure
 */
async function runGit(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }

  return stdout.trim();
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, message = "Condition not met" } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`${message} (timeout after ${timeout}ms)`);
}

/**
 * Generate unique port base for test (to avoid conflicts)
 * Uses ports in 50000-59000 range
 */
export function getTestPortBase(): number {
  return 50000 + ((testCounter * 1000) % 9000);
}
