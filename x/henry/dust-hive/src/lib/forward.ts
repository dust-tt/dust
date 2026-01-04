// TCP forwarder management for OAuth redirect support
// Forwards traffic from port 3000 to the active environment's front port

import { unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "./logger";
import {
  FORWARDER_LOG_PATH,
  FORWARDER_PID_PATH,
  FORWARDER_PORT,
  FORWARDER_STATE_PATH,
} from "./paths";
import { isPortInUse } from "./ports";
import { isProcessRunning } from "./process";
import { createPropertyChecker } from "./typeGuards";

export interface ForwarderState {
  targetEnv: string;
  targetPort: number;
  updatedAt: string;
}

// Type guard for ForwarderState
function isForwarderState(data: unknown): data is ForwarderState {
  const checker = createPropertyChecker(data);
  if (!checker) return false;

  return (
    checker.hasString("targetEnv") &&
    checker.hasNumber("targetPort") &&
    checker.hasString("updatedAt")
  );
}

// Read forwarder PID, returns null if not running
export async function readForwarderPid(): Promise<number | null> {
  const file = Bun.file(FORWARDER_PID_PATH);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  const pid = Number.parseInt(content.trim(), 10);

  if (Number.isNaN(pid)) {
    return null;
  }

  if (!isProcessRunning(pid)) {
    // Stale PID file, clean it up
    await cleanupForwarderPid();
    return null;
  }

  return pid;
}

// Write forwarder PID
async function writeForwarderPid(pid: number): Promise<void> {
  await Bun.write(FORWARDER_PID_PATH, String(pid));
}

// Remove forwarder PID file
async function cleanupForwarderPid(): Promise<void> {
  try {
    await unlink(FORWARDER_PID_PATH);
  } catch {
    // Ignore if file doesn't exist
  }
}

// Read forwarder state
export async function readForwarderState(): Promise<ForwarderState | null> {
  const file = Bun.file(FORWARDER_STATE_PATH);

  if (!(await file.exists())) {
    return null;
  }

  const data: unknown = await file.json();
  if (!isForwarderState(data)) {
    return null;
  }

  return data;
}

// Write forwarder state
async function writeForwarderState(state: ForwarderState): Promise<void> {
  await Bun.write(FORWARDER_STATE_PATH, JSON.stringify(state, null, 2));
}

// Check if forwarder is running
export async function isForwarderRunning(): Promise<boolean> {
  const pid = await readForwarderPid();
  return pid !== null;
}

// Stop forwarder if running
export async function stopForwarder(): Promise<boolean> {
  const pid = await readForwarderPid();

  if (pid === null) {
    return false; // Not running
  }

  // Kill the process
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited
  }

  // Wait for process to exit (up to 2 seconds)
  const start = Date.now();
  while (Date.now() - start < 2000) {
    if (!isProcessRunning(pid)) {
      await cleanupForwarderPid();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Force kill if still running
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process may have already exited
  }

  await cleanupForwarderPid();
  return true;
}

// Start forwarder to target port
export async function startForwarder(targetPort: number, envName: string): Promise<void> {
  // Stop existing forwarder if running
  await stopForwarder();

  // Check if port 3000 is already in use by something else
  if (isPortInUse(FORWARDER_PORT)) {
    throw new Error(
      `Port ${FORWARDER_PORT} is already in use. Stop the process using it before starting the forwarder.`
    );
  }

  // Find the daemon script - need to locate it relative to project root
  // When bundled, import.meta.path is in dist/, when running from source it's in src/lib/
  // We find the project root by looking for package.json
  const findProjectRoot = (startPath: string): string => {
    let dir = startPath;
    while (dir !== "/") {
      if (Bun.file(join(dir, "package.json")).size) {
        return dir;
      }
      dir = dirname(dir);
    }
    return startPath; // Fallback
  };
  const projectRoot = findProjectRoot(dirname(import.meta.path));
  const daemonPath = join(projectRoot, "src", "forward-daemon.ts");

  // Spawn the forwarder daemon
  const logFile = Bun.file(FORWARDER_LOG_PATH);

  const proc = Bun.spawn(["bun", "run", daemonPath, String(targetPort)], {
    env: process.env,
    stdout: logFile,
    stderr: logFile,
    detached: true,
  });

  proc.unref();

  // Wait a moment for the process to start
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Check if process is still running
  if (!isProcessRunning(proc.pid)) {
    const log = await Bun.file(FORWARDER_LOG_PATH).text();
    throw new Error(`Forwarder failed to start: ${log.slice(-500)}`);
  }

  // Write PID and state
  await writeForwarderPid(proc.pid);
  await writeForwarderState({
    targetEnv: envName,
    targetPort,
    updatedAt: new Date().toISOString(),
  });

  logger.success(`Forwarding http://localhost:${FORWARDER_PORT} → ${envName} (port ${targetPort})`);
}

// Get forwarder status info
export interface ForwarderStatus {
  running: boolean;
  pid: number | null;
  state: ForwarderState | null;
}

export async function getForwarderStatus(): Promise<ForwarderStatus> {
  const pid = await readForwarderPid();
  const state = await readForwarderState();

  return {
    running: pid !== null,
    pid,
    state,
  };
}
