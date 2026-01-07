import { spawnSync } from "node:child_process";
import { mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createTypeGuard, isErrnoException } from "./errors";
import { directoryExists } from "./fs";
import { DUST_HIVE_ENVS, DUST_HIVE_HOME, getPortsPath } from "./paths";
import { isProcessRunning, killProcess } from "./process";

// Port offsets from base (spec-defined).
// Offsets chosen so base_port + offset resembles standard ports:
// postgres: 432 -> 10432 (resembles 5432), redis: 379 -> 10379 (resembles 6379),
// qdrant: 333 -> 10333 (resembles 6333 HTTP), elasticsearch: 200 -> 10200 (resembles 9200)
export const PORT_OFFSETS = {
  front: 0,
  core: 1,
  connectors: 2,
  oauth: 6,
  postgres: 432,
  redis: 379,
  qdrantHttp: 333,
  qdrantGrpc: 334,
  elasticsearch: 200,
  apacheTika: 998,
} as const;

export const BASE_PORT = 10000;
export const PORT_INCREMENT = 1000;
const PORT_LOCK_PATH = join(DUST_HIVE_HOME, "ports.lock");
const PORT_LOCK_TIMEOUT_MS = 5000;
const PORT_LOCK_STALE_MS = 30000;

const PortAllocationFields = z.object({
  base: z.number(),
  front: z.number(),
  core: z.number(),
  connectors: z.number(),
  oauth: z.number(),
  postgres: z.number(),
  redis: z.number(),
  qdrantHttp: z.number(),
  qdrantGrpc: z.number(),
  elasticsearch: z.number(),
  apacheTika: z.number(),
});

const PortAllocationSchema = PortAllocationFields.passthrough();

export type PortAllocation = z.infer<typeof PortAllocationFields>;

const isPortAllocation = createTypeGuard<PortAllocation>(PortAllocationSchema);

// Calculate ports from a base port
export function calculatePorts(base: number): PortAllocation {
  const ports: PortAllocation = {
    base,
    front: base + PORT_OFFSETS.front,
    core: base + PORT_OFFSETS.core,
    connectors: base + PORT_OFFSETS.connectors,
    oauth: base + PORT_OFFSETS.oauth,
    postgres: base + PORT_OFFSETS.postgres,
    redis: base + PORT_OFFSETS.redis,
    qdrantHttp: base + PORT_OFFSETS.qdrantHttp,
    qdrantGrpc: base + PORT_OFFSETS.qdrantGrpc,
    elasticsearch: base + PORT_OFFSETS.elasticsearch,
    apacheTika: base + PORT_OFFSETS.apacheTika,
  };
  for (const port of Object.values(ports)) {
    if (port < 1 || port > 65535) {
      throw new Error(`Port out of range: ${port}`);
    }
  }
  return ports;
}

// Get all currently allocated base ports
async function getAllocatedBasePorts(): Promise<number[]> {
  const envsExists = await directoryExists(DUST_HIVE_ENVS);
  if (!envsExists) {
    return [];
  }

  const entries = await readdir(DUST_HIVE_ENVS, { withFileTypes: true });
  const bases: number[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const portsPath = getPortsPath(entry.name);
    const file = Bun.file(portsPath);

    if (await file.exists()) {
      const data: unknown = await file.json();
      if (isPortAllocation(data)) {
        bases.push(data.base);
      }
    }
  }

  return bases;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lock acquisition with retry logic
async function acquirePortLock(): Promise<() => Promise<void>> {
  await mkdir(DUST_HIVE_HOME, { recursive: true });
  const start = Date.now();

  while (true) {
    try {
      const handle = await open(PORT_LOCK_PATH, "wx");
      try {
        await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      } catch (writeError) {
        await handle.close();
        await unlink(PORT_LOCK_PATH).catch((unlinkError) => {
          if (!isErrnoException(unlinkError) || unlinkError.code !== "ENOENT") {
            throw unlinkError;
          }
        });
        throw writeError;
      }
      return async () => {
        await handle.close();
        try {
          await unlink(PORT_LOCK_PATH);
        } catch (unlinkError) {
          if (isErrnoException(unlinkError) && unlinkError.code === "ENOENT") {
            return;
          }
          throw unlinkError;
        }
      };
    } catch (error) {
      if (isErrnoException(error) && error.code === "EEXIST") {
        try {
          const info = await stat(PORT_LOCK_PATH);
          if (Date.now() - info.mtimeMs > PORT_LOCK_STALE_MS) {
            await unlink(PORT_LOCK_PATH);
            continue;
          }
        } catch (statError) {
          if (isErrnoException(statError) && statError.code === "ENOENT") {
            continue;
          }
          throw statError;
        }

        if (Date.now() - start > PORT_LOCK_TIMEOUT_MS) {
          throw new Error("Timed out acquiring port allocation lock");
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

// Allocate next available base port
export async function allocateNextPort(): Promise<number> {
  const release = await acquirePortLock();
  try {
    const allocated = new Set(await getAllocatedBasePorts());
    const maxOffset = Math.max(...Object.values(PORT_OFFSETS));
    const maxBase = 65535 - maxOffset;

    // Find lowest available base port starting from BASE_PORT
    let candidate = BASE_PORT;
    while (allocated.has(candidate)) {
      candidate += PORT_INCREMENT;
      if (candidate > maxBase) {
        throw new Error("No available port blocks remaining");
      }
    }

    return candidate;
  } finally {
    await release();
  }
}

// Save port allocation for an environment
export async function savePortAllocation(name: string, ports: PortAllocation): Promise<void> {
  const path = getPortsPath(name);
  await Bun.write(path, JSON.stringify(ports, null, 2));
}

// Load port allocation for an environment
export async function loadPortAllocation(name: string): Promise<PortAllocation | null> {
  const path = getPortsPath(name);
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const data: unknown = await file.json();
  if (!isPortAllocation(data)) {
    return null;
  }

  return data;
}

// Get PIDs using a specific port
export function getPidsOnPort(port: number): number[] {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf-8",
  });

  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";
  if (result.error) {
    if (isErrnoException(result.error) && result.error.code === "ENOENT") {
      throw new Error("lsof not found in PATH");
    }
    if (result.status === 1 && stdout === "") {
      return [];
    }
    throw result.error;
  }

  if (result.status === 1 && stdout === "") {
    return [];
  }

  if (result.status !== 0) {
    throw new Error(`lsof failed for port ${port}: ${stderr || "unknown error"}`);
  }

  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((pid) => Number.parseInt(pid, 10))
    .filter((pid) => !Number.isNaN(pid));
}

// Check if a port is in use
export function isPortInUse(port: number): boolean {
  return getPidsOnPort(port).length > 0;
}

// Check and clean service ports (front, core, connectors, oauth)
export function getServicePorts(ports: PortAllocation): number[] {
  return [ports.front, ports.core, ports.connectors, ports.oauth];
}

export interface PortProcessInfo {
  pid: number;
  command: string | null;
}

function getProcessCommand(pid: number): string | null {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" });
  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";
  if (result.error) {
    if (isErrnoException(result.error) && result.error.code === "ENOENT") {
      throw new Error("ps not found in PATH");
    }
    if (result.status === 1 && stdout === "") {
      return null;
    }
    throw result.error;
  }
  if (result.status === 1 && stdout === "") {
    return null;
  }
  if (result.status !== 0) {
    throw new Error(`ps failed for pid ${pid}: ${stderr || "unknown error"}`);
  }
  return stdout.length > 0 ? stdout : null;
}

export function getPortProcessInfo(port: number): PortProcessInfo[] {
  const pids = getPidsOnPort(port);
  return pids.map((pid) => ({ pid, command: getProcessCommand(pid) }));
}

async function terminateProcess(pid: number, timeoutMs = 2000): Promise<void> {
  await killProcess(pid, "SIGTERM");

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await killProcess(pid, "SIGKILL");
}

export interface PortCleanupResult {
  killedPorts: number[];
  blockedPorts: Array<{ port: number; processes: PortProcessInfo[] }>;
}

// Kill any orphaned processes on service ports
export async function cleanupServicePorts(
  ports: PortAllocation,
  options: { allowedPids?: Set<number>; force?: boolean } = {}
): Promise<PortCleanupResult> {
  const servicePorts = getServicePorts(ports);
  const killedPorts: number[] = [];
  const blockedPorts: Array<{ port: number; processes: PortProcessInfo[] }> = [];
  const allowed = options.allowedPids ?? new Set<number>();

  for (const port of servicePorts) {
    const processes = getPortProcessInfo(port);
    if (processes.length === 0) {
      continue;
    }

    const unknown = processes.filter((proc) => !allowed.has(proc.pid));
    if (unknown.length > 0 && !options.force) {
      blockedPorts.push({ port, processes: unknown });
      continue;
    }

    for (const proc of processes) {
      await terminateProcess(proc.pid);
    }
    killedPorts.push(port);
  }

  return { killedPorts, blockedPorts };
}
