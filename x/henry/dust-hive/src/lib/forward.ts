// TCP forwarder management for OAuth redirect support
// Forwards traffic from port 3000 to the active environment's front port

import { unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { FORWARDER_PORTS } from "./forwarderConfig";
import { fileExists } from "./fs";
import { logger } from "./logger";
import { FORWARDER_LOG_PATH, FORWARDER_PID_PATH, FORWARDER_STATE_PATH } from "./paths";
import { getPortProcessInfo, isPortInUse } from "./ports";
import { isProcessRunning, killProcess } from "./process";

const ForwarderStateFields = z.object({
  targetEnv: z.string(),
  basePort: z.number(),
  updatedAt: z.string(),
});

const ForwarderStateSchema = ForwarderStateFields.passthrough();

export type ForwarderState = z.infer<typeof ForwarderStateFields>;

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

// Type guard for ForwarderState
function isForwarderState(data: unknown): data is ForwarderState {
  return ForwarderStateSchema.safeParse(data).success;
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
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
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
  await killProcess(pid, "SIGTERM");

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
  await killProcess(pid, "SIGKILL");

  await cleanupForwarderPid();
  return true;
}

function looksLikeForwarderProcess(command: string | null): boolean {
  if (!command) return false;
  const normalized = command.toLowerCase();
  return normalized.includes("forward-daemon");
}

async function stopForwarderProcessesOnPorts(ports: number[]): Promise<boolean> {
  const portInfos = ports.map((port) => ({ port, processes: getPortProcessInfo(port) }));
  const forwarderPids = new Set<number>();
  const nonForwarder = portInfos.some((info) =>
    info.processes.some((proc) => !looksLikeForwarderProcess(proc.command))
  );

  if (nonForwarder) {
    return false;
  }

  for (const info of portInfos) {
    for (const proc of info.processes) {
      if (looksLikeForwarderProcess(proc.command)) {
        forwarderPids.add(proc.pid);
      }
    }
  }

  if (forwarderPids.size === 0) {
    return false;
  }

  for (const pid of forwarderPids) {
    await killProcess(pid, "SIGTERM");
  }

  const start = Date.now();
  while (Date.now() - start < 2000) {
    if (ports.every((port) => !isPortInUse(port))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const pid of forwarderPids) {
    await killProcess(pid, "SIGKILL");
  }

  const killed = ports.every((port) => !isPortInUse(port));
  return killed;
}

function formatPortProcessInfo(ports: number[]): string {
  return ports
    .map((port) => {
      const processes = getPortProcessInfo(port);
      const detail = processes
        .map((proc) => `${proc.pid}${proc.command ? ` (${proc.command})` : ""}`)
        .join(", ");
      return `${port}: ${detail || "unknown"}`;
    })
    .join("; ");
}

// Start forwarder to target port
export async function startForwarder(basePort: number, envName: string): Promise<void> {
  // Stop existing forwarder if running
  await stopForwarder();

  // Check if any standard ports are already in use by something else
  const portsInUse = FORWARDER_PORTS.filter((port) => isPortInUse(port));
  if (portsInUse.length > 0) {
    const stopped = await stopForwarderProcessesOnPorts(portsInUse);
    if (!stopped) {
      const details = formatPortProcessInfo(portsInUse);
      throw new Error(
        `Ports ${portsInUse.join(", ")} are already in use (${details}). Stop the processes using them before starting the forwarder.`
      );
    }
  }

  // Find the daemon script - need to locate it relative to project root
  // When bundled, import.meta.path is in dist/, when running from source it's in src/lib/
  // We find the project root by looking for package.json
  const findProjectRoot = async (startPath: string): Promise<string> => {
    let dir = startPath;
    while (dir !== "/") {
      if (await fileExists(join(dir, "package.json"))) {
        return dir;
      }
      dir = dirname(dir);
    }
    return startPath; // Fallback
  };
  const projectRoot = await findProjectRoot(dirname(import.meta.path));
  const candidates = [
    join(projectRoot, "dist", "forward-daemon.js"),
    join(projectRoot, "src", "forward-daemon.ts"),
  ];
  let daemonPath: string | null = null;
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      daemonPath = candidate;
      break;
    }
  }

  if (!daemonPath) {
    throw new Error(
      "Forwarder daemon not found (expected dist/forward-daemon.js or src/forward-daemon.ts)"
    );
  }

  // Spawn the forwarder daemon
  const logFile = Bun.file(FORWARDER_LOG_PATH);

  const proc = Bun.spawn(["bun", "run", daemonPath, String(basePort)], {
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
    basePort,
    updatedAt: new Date().toISOString(),
  });

  logger.success(`Forwarding ports ${FORWARDER_PORTS.join(", ")} → ${envName} (base ${basePort})`);
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
