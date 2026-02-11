// Temporal server management (global daemon, not per-environment)

import { open, rename } from "node:fs/promises";
import { createConnection } from "node:net";
import { TEMPORAL_DB_PATH, TEMPORAL_LOG_PATH, TEMPORAL_PID_PATH, TEMPORAL_PORT } from "./paths";
import { isProcessRunning, readPidFile, stopProcessByPidFile, writePidFile } from "./pid-file";

// Check if something is listening on the temporal port
export async function isTemporalPortInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port: TEMPORAL_PORT, host: "127.0.0.1" });

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    // Timeout after 1 second
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Read temporal PID from file, returns null if not running
export async function getTemporalPid(): Promise<number | null> {
  return readPidFile(TEMPORAL_PID_PATH);
}

// Rotate log file if it exceeds maxSize
async function rotateLogIfNeeded(maxSize = 100 * 1024 * 1024): Promise<void> {
  const file = Bun.file(TEMPORAL_LOG_PATH);

  if (!(await file.exists())) {
    return;
  }

  const stat = await file.stat();
  if (stat && stat.size > maxSize) {
    const rotatedPath = `${TEMPORAL_LOG_PATH}.${Date.now()}`;
    await rename(TEMPORAL_LOG_PATH, rotatedPath);
    await Bun.write(TEMPORAL_LOG_PATH, "");
  }
}

// Check if temporal server is running (either managed by us or externally)
export async function isTemporalServerRunning(): Promise<{
  running: boolean;
  managed: boolean;
  pid: number | null;
}> {
  const pid = await getTemporalPid();

  if (pid !== null) {
    return { running: true, managed: true, pid };
  }

  // Check if something else is listening on the port
  const portInUse = await isTemporalPortInUse();
  if (portInUse) {
    return { running: true, managed: false, pid: null };
  }

  return { running: false, managed: false, pid: null };
}

// Wait for temporal to be ready (port responding)
async function waitForTemporalReady(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const portInUse = await isTemporalPortInUse();
    if (portInUse) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

// Start the temporal server as a daemon
export async function startTemporalServer(): Promise<{
  success: boolean;
  error?: string;
  pid?: number;
}> {
  // Check if already running
  const status = await isTemporalServerRunning();
  if (status.running) {
    if (status.managed && status.pid !== null) {
      return { success: true, pid: status.pid };
    }
    return {
      success: false,
      error: `Temporal is already running externally on port ${TEMPORAL_PORT}. Stop it first to use dust-hive managed temporal.`,
    };
  }

  await rotateLogIfNeeded();
  const logHandle = await open(TEMPORAL_LOG_PATH, "a");

  const proc = Bun.spawn(["temporal", "server", "start-dev", "--db-filename", TEMPORAL_DB_PATH], {
    stdout: logHandle.fd,
    stderr: logHandle.fd,
    detached: true,
  });
  await logHandle.close();

  proc.unref();

  // Wait a moment to check if process started
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!isProcessRunning(proc.pid)) {
    return { success: false, error: "Temporal server failed to start" };
  }

  await writePidFile(TEMPORAL_PID_PATH, proc.pid);

  // Wait for temporal to be ready
  const ready = await waitForTemporalReady();
  if (!ready) {
    return { success: false, error: "Temporal server started but not responding on port" };
  }

  return { success: true, pid: proc.pid };
}

// Stop the temporal server
export async function stopTemporalServer(): Promise<{ success: boolean; wasRunning: boolean }> {
  const wasRunning = await stopProcessByPidFile(TEMPORAL_PID_PATH);
  return { success: true, wasRunning };
}

// Wait for the temporal port to be free
async function waitForPortFree(timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const portInUse = await isTemporalPortInUse();
    if (!portInUse) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

// Restart the temporal server
export async function restartTemporalServer(): Promise<{
  success: boolean;
  error?: string;
  pid?: number;
}> {
  await stopTemporalServer();

  // Wait for the port to be free before starting
  // This avoids a race condition where the old process is still releasing the port
  const portFree = await waitForPortFree();
  if (!portFree) {
    return {
      success: false,
      error: `Port ${TEMPORAL_PORT} is still in use after stopping temporal. Another process may be using it.`,
    };
  }

  return startTemporalServer();
}
