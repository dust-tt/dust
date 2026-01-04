/**
 * Cleanup utilities for integration tests
 *
 * Provides guaranteed cleanup even on test failure.
 */

import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Track PIDs spawned during tests for cleanup on exit
const trackedPids: Set<number> = new Set();

// Track cleanup tasks to run after each test
const cleanupTasks: Array<() => Promise<void>> = [];

/**
 * Register a cleanup task to run after the test
 */
export function registerCleanup(task: () => Promise<void>): void {
  cleanupTasks.push(task);
}

/**
 * Run all registered cleanup tasks (call in afterEach)
 */
export async function runAllCleanups(): Promise<void> {
  // Run in reverse order (LIFO)
  for (const task of cleanupTasks.reverse()) {
    try {
      await task();
    } catch (error) {
      // Log but don't throw - we want all cleanups to run
      console.warn("Cleanup task failed:", error);
    }
  }
  cleanupTasks.length = 0;
}

/**
 * Track a PID for cleanup on process exit
 */
export function trackPid(pid: number): void {
  trackedPids.add(pid);
}

/**
 * Remove a PID from tracking (after it's been cleaned up)
 */
export function untrackPid(pid: number): void {
  trackedPids.delete(pid);
}

/**
 * Kill all tracked PIDs
 */
export function killAllTrackedPids(): void {
  for (const pid of trackedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may have already exited
    }
  }
  trackedPids.clear();
}

/**
 * Kill a process by PID (tries process group first, then individual)
 */
function killPid(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL"); // Kill process group
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already dead
    }
  }
}

/**
 * Stop a service by reading its PID file and killing the process
 */
async function stopServiceByPid(envDir: string, service: string): Promise<void> {
  const pidPath = join(envDir, `${service}.pid`);
  const pidFile = Bun.file(pidPath);

  if (!(await pidFile.exists())) {
    return;
  }

  const pid = Number.parseInt(await pidFile.text(), 10);
  if (!Number.isNaN(pid)) {
    killPid(pid);
  }
}

/**
 * Stop all services for an environment
 */
async function stopAllServicesByPid(envDir: string): Promise<void> {
  const services = ["sdk", "front", "core", "oauth", "connectors", "front-workers"];

  for (const service of services) {
    await stopServiceByPid(envDir, service).catch(() => {});
  }
}

/**
 * Stop Docker containers and remove volumes
 */
async function cleanupDocker(envName: string): Promise<void> {
  const dockerProject = `dust-hive-${envName}`;

  // Stop containers
  const dockerProc = Bun.spawn(
    ["docker", "compose", "-p", dockerProject, "down", "-v", "--remove-orphans"],
    { stdout: "pipe", stderr: "pipe" }
  );
  await dockerProc.exited;

  // Remove volumes (force)
  const volumes = [
    `${dockerProject}-pgsql`,
    `${dockerProject}-qdrant-primary`,
    `${dockerProject}-qdrant-secondary`,
    `${dockerProject}-elasticsearch`,
  ];

  for (const vol of volumes) {
    const volProc = Bun.spawn(["docker", "volume", "rm", "-f", vol], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await volProc.exited;
  }
}

/**
 * Remove git worktree and branch
 */
async function cleanupGitWorktree(envName: string): Promise<void> {
  const DUST_HIVE_WORKTREES = join(homedir(), "dust-hive");
  const worktreePath = join(DUST_HIVE_WORKTREES, envName);
  const branchName = `${envName}-workspace`;

  // Remove worktree
  const wtProc = Bun.spawn(["git", "worktree", "remove", worktreePath, "--force"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await wtProc.exited;

  // Delete branch
  const branchProc = Bun.spawn(["git", "branch", "-D", branchName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await branchProc.exited;

  // Remove directory if still exists
  await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
}

/**
 * Clean up a test environment completely
 */
export async function cleanupTestEnvironment(envName: string): Promise<void> {
  const DUST_HIVE_HOME = join(homedir(), ".dust-hive");
  const envDir = join(DUST_HIVE_HOME, "envs", envName);

  // Stop all services
  await stopAllServicesByPid(envDir);

  // Clean up Docker
  await cleanupDocker(envName);

  // Clean up git worktree
  await cleanupGitWorktree(envName);

  // Remove environment directory
  await rm(envDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Clean up forwarder process
 */
export async function cleanupForwarder(): Promise<void> {
  const DUST_HIVE_HOME = join(homedir(), ".dust-hive");
  const pidPath = join(DUST_HIVE_HOME, "forward.pid");

  const pidFile = Bun.file(pidPath);
  if (!(await pidFile.exists())) {
    return;
  }

  const pid = Number.parseInt(await pidFile.text(), 10);
  if (!Number.isNaN(pid)) {
    killPid(pid);
  }
}

// Register cleanup on process exit
process.on("exit", killAllTrackedPids);
process.on("SIGINT", () => {
  killAllTrackedPids();
  process.exit(1);
});
process.on("SIGTERM", () => {
  killAllTrackedPids();
  process.exit(1);
});
