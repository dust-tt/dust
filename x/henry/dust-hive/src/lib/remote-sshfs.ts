// SSHFS mount/unmount for remote environments

import { mkdir, rmdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { logger } from "./logger";
import type { RemoteHost } from "./remote-host";

// Get the local mount point for a remote environment
export function getRemoteMountPoint(remoteName: string, envName: string): string {
  return join(homedir(), "dust-hive", remoteName, envName);
}

// Get the remote worktree path
export function getRemoteWorktreePath(host: RemoteHost, envName: string): string {
  return `/home/${host.remoteUser}/dust-hive/${envName}`;
}

/**
 * Build the sshfs mount command for a GCP IAP-tunneled connection
 */
function buildSshfsCommand(host: RemoteHost, remotePath: string, localPath: string): string[] {
  // sshfs with gcloud compute ssh as the ssh command
  // Note: We use a wrapper approach since sshfs -o ssh_command doesn't work well with complex commands
  return [
    "sshfs",
    `${host.instance}:${remotePath}`,
    localPath,
    "-o",
    `ssh_command=gcloud compute ssh --tunnel-through-iap --project=${host.project} --zone=${host.zone} --`,
    "-o",
    "reconnect",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "cache=yes",
    "-o",
    "kernel_cache",
    "-o",
    "compression=no",
  ];
}

/**
 * Check if a path is an SSHFS mount
 */
export async function isMounted(localPath: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["mount"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Check if the path appears in mount output
    // macOS format: "user@host:path on /local/path (osxfuse, ...)"
    return output.includes(` on ${localPath} `);
  } catch {
    return false;
  }
}

/**
 * Mount a remote environment via SSHFS
 */
export async function mountRemoteEnv(
  host: RemoteHost,
  envName: string
): Promise<{ success: boolean; error?: string }> {
  const localPath = getRemoteMountPoint(host.name, envName);
  const remotePath = getRemoteWorktreePath(host, envName);

  // Check if already mounted
  if (await isMounted(localPath)) {
    return { success: true }; // Already mounted is fine
  }

  // Create mount point directory
  await mkdir(localPath, { recursive: true });

  // Build and execute sshfs command
  const args = buildSshfsCommand(host, remotePath, localPath);
  logger.step(`Mounting ${remotePath} to ${localPath}...`);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    // Clean up empty directory on failure
    try {
      await rmdir(localPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: stderr || `sshfs exited with code ${exitCode}`,
    };
  }

  return { success: true };
}

/**
 * Unmount a remote environment
 */
export async function unmountRemoteEnv(
  remoteName: string,
  envName: string
): Promise<{ success: boolean; error?: string }> {
  const localPath = getRemoteMountPoint(remoteName, envName);

  // Check if mounted
  if (!(await isMounted(localPath))) {
    return { success: true }; // Not mounted is fine
  }

  logger.step(`Unmounting ${localPath}...`);

  // Use diskutil unmount on macOS, umount on Linux
  const isMac = process.platform === "darwin";
  const args = isMac ? ["diskutil", "unmount", localPath] : ["fusermount", "-u", localPath];

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    // Try force unmount
    const forceArgs = isMac
      ? ["diskutil", "unmount", "force", localPath]
      : ["fusermount", "-uz", localPath];

    const forceProc = Bun.spawn(forceArgs, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const forceStderr = await new Response(forceProc.stderr).text();
    const forceExitCode = await forceProc.exited;

    if (forceExitCode !== 0) {
      return {
        success: false,
        error: forceStderr || stderr || `unmount failed with code ${forceExitCode}`,
      };
    }
  }

  // Clean up empty mount point directory
  try {
    await rmdir(localPath);
  } catch {
    // Ignore cleanup errors
  }

  return { success: true };
}

/**
 * Check if sshfs is installed
 */
export async function isSshfsInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "sshfs"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}
