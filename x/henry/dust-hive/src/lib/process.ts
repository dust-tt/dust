import { open, rename, stat, unlink } from "node:fs/promises";
import { logger } from "./logger";
import { getLogPath, getPidPath, getWorktreeDir } from "./paths";
import { ALL_SERVICES, type ServiceName } from "./services";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

// Check if a process is running by PID
export function isProcessRunning(pid: number): boolean {
  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ESRCH") {
      return false;
    }
    throw error;
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
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

// Kill a process and its entire process group by PID
export async function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  try {
    // Try to kill the entire process group (negative PID)
    process.kill(-pid, signal);
    return;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ESRCH") {
      return;
    }
    // If process group kill fails, try killing just the process
    try {
      process.kill(pid, signal);
    } catch (innerError) {
      if (isErrnoException(innerError) && innerError.code === "ESRCH") {
        return;
      }
      throw innerError;
    }
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

async function readFileTail(path: string, maxBytes: number): Promise<string> {
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

// Wait for SDK build to complete with error detection
export async function waitForSdkBuild(envName: string, timeoutMs = 60000): Promise<void> {
  logger.step("Waiting for SDK to build...");

  const worktreePath = getWorktreeDir(envName);
  const targetFile = `${worktreePath}/sdks/js/dist/client.esm.js`;
  const logFile = getLogPath(envName, "sdk");
  const start = Date.now();
  const checkInterval = 500;
  let lastLogSize = 0;

  while (Date.now() - start < timeoutMs) {
    // Check if build output exists
    const distFile = Bun.file(targetFile);
    if (await distFile.exists()) {
      logger.success("SDK build complete");
      return;
    }

    // Check log for errors
    const log = Bun.file(logFile);
    if (await log.exists()) {
      const info = await stat(logFile);
      if (info.size !== lastLogSize) {
        lastLogSize = info.size;
        const logContent = await readFileTail(logFile, 4000);
        if (logContent.includes("npm error") || logContent.includes("Error:")) {
          const errorLines = logContent
            .split("\n")
            .filter((l) => l.includes("error") || l.includes("Error"))
            .slice(0, 5)
            .join("\n");
          throw new Error(`SDK build failed:\n${errorLines}`);
        }
      }
    }

    // Check if process is still running
    if (!(await isServiceRunning(envName, "sdk"))) {
      const log = Bun.file(logFile);
      const logContent = (await log.exists()) ? await log.text() : "No log available";
      throw new Error(`SDK process exited unexpectedly. Log:\n${logContent.slice(-500)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  throw new Error("SDK build timed out after 60s");
}
