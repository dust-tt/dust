import { open, rename } from "node:fs/promises";
import { getLogPath, getPidPath } from "./paths";
import {
  cleanupPidFile as cleanupPidFileByPath,
  isProcessRunning,
  killProcess,
  readPidFile,
  stopProcessByPidFile,
  writePidFile,
} from "./pid-file";
import { ALL_SERVICES, type ServiceName } from "./services";

// Re-export for backward compatibility (used by ports.ts)
export { isProcessRunning, killProcess };

// Read PID from file, returns null if file doesn't exist or PID is stale
export async function readPid(envName: string, service: ServiceName): Promise<number | null> {
  const pidPath = getPidPath(envName, service);
  return readPidFile(pidPath);
}

// Write PID to file
export async function writePid(envName: string, service: ServiceName, pid: number): Promise<void> {
  const pidPath = getPidPath(envName, service);
  await writePidFile(pidPath, pid);
}

// Remove PID file
export async function cleanupPidFile(envName: string, service: ServiceName): Promise<void> {
  const pidPath = getPidPath(envName, service);
  await cleanupPidFileByPath(pidPath);
}

// Stop a service by name
export async function stopService(envName: string, service: ServiceName): Promise<boolean> {
  const pidPath = getPidPath(envName, service);
  return stopProcessByPidFile(pidPath);
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

// Stop all services for an environment (reverse of start order)
export async function stopAllServices(envName: string): Promise<void> {
  for (const service of [...ALL_SERVICES].reverse()) {
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
  await rotateLogIfNeeded(envName, service);
  const logPath = getLogPath(envName, service);
  const logHandle = await open(logPath, "a");

  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      ...options.env,
    },
    stdout: logHandle.fd,
    stderr: logHandle.fd,
    // Don't wait for this child process
    detached: true,
  });
  await logHandle.close();

  // Unref to allow parent to exit while child continues
  proc.unref();

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
    const rotatedPath = `${logPath}.${Date.now()}`;
    await rename(logPath, rotatedPath);
    await Bun.write(logPath, "");
  }
}

export async function readFileTail(path: string, maxBytes: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    const length = Math.min(maxBytes, info.size);
    if (length === 0) {
      return "";
    }
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, info.size - length);
    return buffer.toString("utf-8");
  } finally {
    await handle.close();
  }
}
