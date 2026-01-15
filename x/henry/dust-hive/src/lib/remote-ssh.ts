// SSH execution via gcloud compute ssh with IAP tunneling

import type { RemoteHost } from "./remote-host";

export interface SshExecOptions {
  /** Working directory on the remote machine */
  cwd?: string;
  /** Whether to allocate a TTY (for interactive commands) */
  tty?: boolean;
  /** Timeout in milliseconds (default: no timeout) */
  timeout?: number;
  /** Environment variables to set on the remote */
  env?: Record<string, string>;
}

export interface SshExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Build the gcloud compute ssh command array for a remote host
 */
export function buildSshCommand(host: RemoteHost, remoteCommand?: string): string[] {
  const args = [
    "gcloud",
    "compute",
    "ssh",
    host.instance,
    `--project=${host.project}`,
    `--zone=${host.zone}`,
    "--tunnel-through-iap",
  ];

  if (remoteCommand) {
    args.push("--");
    args.push(remoteCommand);
  }

  return args;
}

/**
 * Build a remote command string with optional cwd and env
 */
function buildRemoteCommand(command: string, options: SshExecOptions = {}): string {
  const parts: string[] = [];

  // Ensure all custom bins are in PATH
  parts.push('export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.temporalio/bin:$PATH"');

  // Add environment variables
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      // Escape single quotes in values
      const escapedValue = value.replace(/'/g, "'\\''");
      parts.push(`export ${key}='${escapedValue}'`);
    }
  }

  // Add cd if cwd specified
  if (options.cwd) {
    parts.push(`cd '${options.cwd}'`);
  }

  // Add the actual command
  parts.push(command);

  return parts.join(" && ");
}

/**
 * Execute a command on a remote host via SSH
 */
export async function sshExec(
  host: RemoteHost,
  command: string,
  options: SshExecOptions = {}
): Promise<SshExecResult> {
  const remoteCommand = buildRemoteCommand(command, options);
  const args = buildSshCommand(host, remoteCommand);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: options.tty ? "inherit" : "ignore",
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options.timeout) {
    timeoutId = setTimeout(() => {
      proc.kill();
    }, options.timeout);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return {
    exitCode,
    stdout,
    stderr,
  };
}

/**
 * Execute a command on a remote host and stream output to console
 */
export async function sshExecStreaming(
  host: RemoteHost,
  command: string,
  options: SshExecOptions = {}
): Promise<number> {
  const remoteCommand = buildRemoteCommand(command, options);
  const args = buildSshCommand(host, remoteCommand);

  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: options.tty ? "inherit" : "ignore",
  });

  return proc.exited;
}

/**
 * Start an interactive SSH session to a remote host
 */
export async function sshInteractive(host: RemoteHost, cwd?: string): Promise<number> {
  const args = [
    "gcloud",
    "compute",
    "ssh",
    host.instance,
    `--project=${host.project}`,
    `--zone=${host.zone}`,
    "--tunnel-through-iap",
  ];

  if (cwd) {
    args.push("--");
    args.push("-t");
    args.push(`cd '${cwd}' && exec $SHELL -l`);
  }

  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  return proc.exited;
}

/**
 * Check if a remote host is reachable via SSH
 */
export async function checkSshConnection(host: RemoteHost): Promise<boolean> {
  try {
    const result = await sshExec(host, "echo ok", { timeout: 30000 });
    return result.exitCode === 0 && result.stdout.trim() === "ok";
  } catch {
    return false;
  }
}

/**
 * Get the remote user's home directory
 */
export async function getRemoteHomeDir(host: RemoteHost): Promise<string | null> {
  const result = await sshExec(host, "echo $HOME", { timeout: 30000 });
  if (result.exitCode === 0) {
    return result.stdout.trim();
  }
  return null;
}
