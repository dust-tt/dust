import { unlink } from "node:fs/promises";
import { getLogPath, getPidPath } from "./paths";

export type ServiceName = "sdk" | "front" | "core" | "oauth" | "connectors" | "front-workers";

export const ALL_SERVICES: ServiceName[] = [
  "sdk",
  "front",
  "core",
  "oauth",
  "connectors",
  "front-workers",
];

export const APP_SERVICES: ServiceName[] = [
  "front",
  "core",
  "oauth",
  "connectors",
  "front-workers",
];

// Check if a process is running by PID
export function isProcessRunning(pid: number): boolean {
  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Read PID from file, returns null if file doesn't exist or PID is stale
export async function readPid(envName: string, service: ServiceName): Promise<number | null> {
  const pidPath = getPidPath(envName, service);
  const file = Bun.file(pidPath);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  const pid = Number.parseInt(content.trim(), 10);

  if (Number.isNaN(pid)) {
    return null;
  }

  // Check if process is actually running
  if (!isProcessRunning(pid)) {
    // Stale PID file, clean it up
    await cleanupPidFile(envName, service);
    return null;
  }

  return pid;
}

// Write PID to file
export async function writePid(envName: string, service: ServiceName, pid: number): Promise<void> {
  const pidPath = getPidPath(envName, service);
  await Bun.write(pidPath, String(pid));
}

// Remove PID file
export async function cleanupPidFile(envName: string, service: ServiceName): Promise<void> {
  const pidPath = getPidPath(envName, service);
  try {
    await unlink(pidPath);
  } catch {
    // Ignore if file doesn't exist
  }
}

// Kill a process by PID
export async function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  try {
    process.kill(pid, signal);
  } catch {
    // Process may have already exited
  }
}

// Stop a service by name
export async function stopService(envName: string, service: ServiceName): Promise<boolean> {
  const pid = await readPid(envName, service);

  if (pid === null) {
    return false; // Service not running
  }

  await killProcess(pid, "SIGTERM");

  // Wait for process to exit (up to 5 seconds)
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (!isProcessRunning(pid)) {
      await cleanupPidFile(envName, service);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Force kill if still running
  await killProcess(pid, "SIGKILL");
  await cleanupPidFile(envName, service);
  return true;
}

// Check if a service is running
export async function isServiceRunning(envName: string, service: ServiceName): Promise<boolean> {
  const pid = await readPid(envName, service);
  return pid !== null;
}

// Get running services for an environment
export async function getRunningServices(envName: string): Promise<ServiceName[]> {
  const running: ServiceName[] = [];

  for (const service of ALL_SERVICES) {
    if (await isServiceRunning(envName, service)) {
      running.push(service);
    }
  }

  return running;
}

// Stop all services for an environment
export async function stopAllServices(envName: string): Promise<void> {
  // Stop in reverse order of startup
  const stopOrder: ServiceName[] = ["front-workers", "connectors", "oauth", "core", "front", "sdk"];

  for (const service of stopOrder) {
    await stopService(envName, service);
  }
}

// Spawn a daemon process with output to log file
export async function spawnDaemon(
  envName: string,
  service: ServiceName,
  command: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
  }
): Promise<number> {
  const logPath = getLogPath(envName, service);

  // Open log file for appending
  const logFile = Bun.file(logPath);

  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      ...options.env,
    },
    stdout: logFile,
    stderr: logFile,
  });

  // Wait a moment to check if process started successfully
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Check if process is still running
  if (!isProcessRunning(proc.pid)) {
    throw new Error(`Failed to start ${service}: process exited immediately`);
  }

  // Write PID file
  await writePid(envName, service, proc.pid);

  return proc.pid;
}

// Spawn a shell command as daemon (with bash -c)
export async function spawnShellDaemon(
  envName: string,
  service: ServiceName,
  shellCommand: string,
  options: {
    cwd: string;
    env?: Record<string, string>;
  }
): Promise<number> {
  return spawnDaemon(envName, service, ["bash", "-c", shellCommand], options);
}

// Truncate log file if it exceeds maxSize (default 100MB)
export async function rotateLogIfNeeded(
  envName: string,
  service: ServiceName,
  maxSize = 100 * 1024 * 1024
): Promise<void> {
  const logPath = getLogPath(envName, service);
  const file = Bun.file(logPath);

  if (!(await file.exists())) {
    return;
  }

  const stat = await file.stat();
  if (stat && stat.size > maxSize) {
    // Truncate by writing empty content
    await Bun.write(logPath, "");
  }
}
