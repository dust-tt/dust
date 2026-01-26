// Unified PID file management for daemon processes
// Used by: service processes, forwarder daemon, temporal server

import { unlink } from "node:fs/promises";
import { isErrnoException } from "./errors";

// Default timeouts for stop operations
const DEFAULT_STOP_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;

/**
 * Check if a process is running by PID.
 * Sends signal 0 which doesn't actually send a signal but checks if process exists.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

/**
 * Kill a process and its entire process group by PID.
 * First attempts to kill the process group (negative PID), then falls back to just the process.
 */
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

/**
 * Read PID from a file.
 * Returns null if file doesn't exist, content is invalid, or process is no longer running (stale).
 * Automatically cleans up stale or corrupted PID files.
 */
export async function readPidFile(path: string): Promise<number | null> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  const pid = Number.parseInt(content.trim(), 10);

  // Invalid PID (NaN, 0, or negative) - clean up corrupted file
  if (Number.isNaN(pid) || pid <= 0) {
    await cleanupPidFile(path);
    return null;
  }

  // Check if process is actually running
  if (!isProcessRunning(pid)) {
    // Stale PID file, clean it up
    await cleanupPidFile(path);
    return null;
  }

  return pid;
}

/**
 * Write PID to a file.
 */
export async function writePidFile(path: string, pid: number): Promise<void> {
  await Bun.write(path, String(pid));
}

/**
 * Remove a PID file.
 * Silently ignores if file doesn't exist (ENOENT).
 */
export async function cleanupPidFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

/**
 * Options for stopping a process managed by a PID file.
 */
export interface StopProcessOptions {
  /** Timeout in ms before sending SIGKILL (default: 5000) */
  timeoutMs?: number;
  /** Poll interval in ms when waiting for process to exit (default: 100) */
  pollIntervalMs?: number;
}

/**
 * Stop a process managed by a PID file.
 * Sends SIGTERM, waits for graceful exit, then SIGKILL if needed.
 * Returns true if a process was stopped, false if nothing was running.
 */
export async function stopProcessByPidFile(
  path: string,
  options: StopProcessOptions = {}
): Promise<boolean> {
  const { timeoutMs = DEFAULT_STOP_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } =
    options;

  const pid = await readPidFile(path);

  if (pid === null) {
    return false; // Not running
  }

  await killProcess(pid, "SIGTERM");

  // Wait for process to exit gracefully
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) {
      await cleanupPidFile(path);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Force kill if still running
  await killProcess(pid, "SIGKILL");
  await cleanupPidFile(path);
  return true;
}
