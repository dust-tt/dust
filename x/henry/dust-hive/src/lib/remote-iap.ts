// IAP tunnel management for remote environments

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DUST_HIVE_ENVS } from "./paths";
import type { RemoteHost } from "./remote-host";

// Port mappings for services
const SERVICE_PORTS = {
  front: 0, // base + 0
  core: 1, // base + 1
  connectors: 2, // base + 2
  oauth: 6, // base + 6
} as const;

// Default base port on remote (first environment)
const DEFAULT_REMOTE_BASE_PORT = 10000;

interface TunnelInfo {
  pid: number;
  localPort: number;
  remotePort: number;
  service: string;
}

interface TunnelsState {
  tunnels: TunnelInfo[];
  startedAt: string;
}

// Get the tunnels state file path for a remote environment
function getTunnelsStatePath(remoteName: string, envName: string): string {
  return join(DUST_HIVE_ENVS, remoteName, envName, "iap-tunnels.json");
}

// Get the directory for storing remote env state
function getRemoteEnvStateDir(remoteName: string, envName: string): string {
  return join(DUST_HIVE_ENVS, remoteName, envName);
}

/**
 * Load tunnels state from disk
 */
async function loadTunnelsState(remoteName: string, envName: string): Promise<TunnelsState | null> {
  const path = getTunnelsStatePath(remoteName, envName);
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as TunnelsState;
  } catch {
    return null;
  }
}

/**
 * Save tunnels state to disk
 */
async function saveTunnelsState(
  remoteName: string,
  envName: string,
  state: TunnelsState
): Promise<void> {
  const dir = getRemoteEnvStateDir(remoteName, envName);
  await mkdir(dir, { recursive: true });
  const path = getTunnelsStatePath(remoteName, envName);
  await writeFile(path, JSON.stringify(state, null, 2));
}

/**
 * Clear tunnels state
 */
async function clearTunnelsState(remoteName: string, envName: string): Promise<void> {
  const path = getTunnelsStatePath(remoteName, envName);
  try {
    await rm(path);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start an IAP tunnel for a single port
 */
async function startTunnel(
  host: RemoteHost,
  remotePort: number,
  localPort: number
): Promise<{ pid: number } | { error: string }> {
  const args = [
    "gcloud",
    "compute",
    "start-iap-tunnel",
    host.instance,
    String(remotePort),
    `--local-host-port=localhost:${localPort}`,
    `--project=${host.project}`,
    `--zone=${host.zone}`,
  ];

  const proc = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
    stdin: "ignore",
  });

  // Give the tunnel a moment to start or fail
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check if process is still running
  if (!isProcessRunning(proc.pid)) {
    const stderr = await new Response(proc.stderr).text();
    return { error: stderr || "Tunnel process exited immediately" };
  }

  return { pid: proc.pid };
}

/**
 * Start IAP tunnels for all services of a remote environment
 */
export async function startIapTunnels(
  host: RemoteHost,
  envName: string,
  remoteBasePort: number = DEFAULT_REMOTE_BASE_PORT
): Promise<{ success: boolean; error?: string }> {
  const tunnels: TunnelInfo[] = [];

  for (const [service, offset] of Object.entries(SERVICE_PORTS)) {
    const remotePort = remoteBasePort + offset;
    const localPort = remotePort; // Use same port locally for simplicity

    const result = await startTunnel(host, remotePort, localPort);

    if ("error" in result) {
      // Clean up any tunnels we've started
      for (const tunnel of tunnels) {
        try {
          process.kill(tunnel.pid);
        } catch {
          // Ignore
        }
      }
      return { success: false, error: `Failed to start ${service} tunnel: ${result.error}` };
    }

    tunnels.push({
      pid: result.pid,
      localPort,
      remotePort,
      service,
    });
  }

  // Save state
  const state: TunnelsState = {
    tunnels,
    startedAt: new Date().toISOString(),
  };
  await saveTunnelsState(host.name, envName, state);

  return { success: true };
}

/**
 * Stop all IAP tunnels for a remote environment
 */
export async function stopIapTunnels(remoteName: string, envName: string): Promise<void> {
  const state = await loadTunnelsState(remoteName, envName);
  if (!state) {
    return;
  }

  for (const tunnel of state.tunnels) {
    try {
      process.kill(tunnel.pid);
    } catch {
      // Ignore - process may have already exited
    }
  }

  await clearTunnelsState(remoteName, envName);
}

/**
 * Get the status of IAP tunnels for a remote environment
 */
export async function getTunnelsStatus(
  remoteName: string,
  envName: string
): Promise<{ running: boolean; tunnels: TunnelInfo[] }> {
  const state = await loadTunnelsState(remoteName, envName);
  if (!state) {
    return { running: false, tunnels: [] };
  }

  // Check which tunnels are still running
  const runningTunnels = state.tunnels.filter((t) => isProcessRunning(t.pid));

  if (runningTunnels.length === 0) {
    await clearTunnelsState(remoteName, envName);
    return { running: false, tunnels: [] };
  }

  return { running: true, tunnels: runningTunnels };
}

/**
 * Get the remote environment's base port by querying dust-hive on the remote
 */
export async function getRemoteEnvBasePort(
  host: RemoteHost,
  envName: string
): Promise<number | null> {
  const { sshExec } = await import("./remote-ssh");

  // Query the ports.json on the remote
  const result = await sshExec(
    host,
    `cat ~/.dust-hive/envs/${envName}/ports.json 2>/dev/null | grep -o '"base":[0-9]*' | cut -d: -f2`,
    { timeout: 10000 }
  );

  if (result.exitCode === 0 && result.stdout.trim()) {
    const port = Number.parseInt(result.stdout.trim(), 10);
    if (!Number.isNaN(port)) {
      return port;
    }
  }

  return null;
}
