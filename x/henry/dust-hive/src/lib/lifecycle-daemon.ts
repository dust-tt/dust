import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isErrnoException } from "./errors";
import { loadLifecycleConfig } from "./lifecycle-config";
import { acquireLifecycleDaemonLock } from "./lifecycle-lock";
import { logger } from "./logger";
import { LIFECYCLE_LOG_PATH, LIFECYCLE_PID_PATH } from "./paths";
import { getProcessCommand } from "./platform";
import { isProcessRunning, killProcess } from "./process";
import { CommandError, Err, Ok, type Result } from "./result";

async function cleanupLifecyclePidFile(): Promise<void> {
  try {
    await unlink(LIFECYCLE_PID_PATH);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export async function getLifecycleDaemonPid(): Promise<number | null> {
  const file = Bun.file(LIFECYCLE_PID_PATH);
  if (!(await file.exists())) {
    return null;
  }
  const pid = Number.parseInt((await file.text()).trim(), 10);
  if (Number.isNaN(pid) || !isProcessRunning(pid)) {
    await cleanupLifecyclePidFile();
    return null;
  }

  const command = getProcessCommand(pid);
  if (!command?.includes("lifecycle-daemon")) {
    await cleanupLifecyclePidFile();
    return null;
  }
  return pid;
}

async function rotateLifecycleLog(maxSizeBytes = 10 * 1024 * 1024): Promise<void> {
  const file = Bun.file(LIFECYCLE_LOG_PATH);
  if (!(await file.exists())) {
    return;
  }
  const info = await file.stat();
  if (info && info.size > maxSizeBytes) {
    await rename(LIFECYCLE_LOG_PATH, `${LIFECYCLE_LOG_PATH}.${Date.now()}`);
  }
}

export async function startLifecycleDaemon(): Promise<Result<number>> {
  const daemonLock = await acquireLifecycleDaemonLock();
  try {
    const existingPid = await getLifecycleDaemonPid();
    if (existingPid !== null) {
      return Ok(existingPid);
    }

    const configResult = await loadLifecycleConfig();
    if (!configResult.ok) {
      return configResult;
    }
    if (Object.keys(configResult.value.environments).length === 0) {
      return Err(new CommandError("No environments have lifecycle management enabled"));
    }

    await rotateLifecycleLog();
    const logHandle = await open(LIFECYCLE_LOG_PATH, "a");
    const daemonPath = join(dirname(import.meta.path), "..", "lifecycle-daemon.ts");
    const proc = Bun.spawn(["bun", "run", daemonPath], {
      stdout: logHandle.fd,
      stderr: logHandle.fd,
      detached: true,
    });
    await logHandle.close();
    proc.unref();

    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!isProcessRunning(proc.pid)) {
      return Err(new CommandError(`Lifecycle daemon failed to start. See ${LIFECYCLE_LOG_PATH}`));
    }
    await Bun.write(LIFECYCLE_PID_PATH, String(proc.pid));
    return Ok(proc.pid);
  } finally {
    await daemonLock.release();
  }
}

export async function ensureLifecycleDaemonRunning(): Promise<void> {
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok || Object.keys(configResult.value.environments).length === 0) {
    return;
  }
  const result = await startLifecycleDaemon();
  if (!result.ok) {
    logger.warn(result.error.message);
  }
}

export async function stopLifecycleDaemon(): Promise<boolean> {
  const daemonLock = await acquireLifecycleDaemonLock();
  try {
    const pid = await getLifecycleDaemonPid();
    if (pid === null) {
      return false;
    }
    await killProcess(pid, "SIGTERM");
    await cleanupLifecyclePidFile();
    return true;
  } finally {
    await daemonLock.release();
  }
}

export async function stopLifecycleDaemonIfUnused(): Promise<boolean> {
  const daemonLock = await acquireLifecycleDaemonLock();
  try {
    const configResult = await loadLifecycleConfig();
    if (!configResult.ok || Object.keys(configResult.value.environments).length > 0) {
      return false;
    }
    const pid = await getLifecycleDaemonPid();
    if (pid === null) {
      return false;
    }
    await killProcess(pid, "SIGTERM");
    await cleanupLifecyclePidFile();
    return true;
  } finally {
    await daemonLock.release();
  }
}
