import { readdir } from "node:fs/promises";
import { DUST_HIVE_ENVS, getPortsPath } from "./paths";
import { createPropertyChecker } from "./typeGuards";

// Port offsets from base (spec-defined).
// Offsets chosen so base_port + offset resembles standard ports:
// postgres: 432 -> 10432 (resembles 5432), redis: 379 -> 10379 (resembles 6379),
// qdrant: 334 -> 10334 (resembles 6334), elasticsearch: 200 -> 10200 (resembles 9200)
export const PORT_OFFSETS = {
  front: 0,
  core: 1,
  connectors: 2,
  oauth: 6,
  postgres: 432,
  redis: 379,
  qdrantHttp: 334,
  qdrantGrpc: 333,
  elasticsearch: 200,
  apacheTika: 998,
} as const;

export const BASE_PORT = 10000;
export const PORT_INCREMENT = 1000;

export interface PortAllocation {
  base: number;
  front: number;
  core: number;
  connectors: number;
  oauth: number;
  postgres: number;
  redis: number;
  qdrantHttp: number;
  qdrantGrpc: number;
  elasticsearch: number;
  apacheTika: number;
}

// Type guard for PortAllocation
function isPortAllocation(data: unknown): data is PortAllocation {
  const checker = createPropertyChecker(data);
  if (!checker) return false;

  return (
    checker.hasNumber("base") &&
    checker.hasNumber("front") &&
    checker.hasNumber("core") &&
    checker.hasNumber("connectors") &&
    checker.hasNumber("oauth") &&
    checker.hasNumber("postgres") &&
    checker.hasNumber("redis") &&
    checker.hasNumber("qdrantHttp") &&
    checker.hasNumber("qdrantGrpc") &&
    checker.hasNumber("elasticsearch") &&
    checker.hasNumber("apacheTika")
  );
}

// Calculate ports from a base port
export function calculatePorts(base: number): PortAllocation {
  return {
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
}

// Get all currently allocated base ports
async function getAllocatedBasePorts(): Promise<number[]> {
  try {
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
  } catch {
    // envs directory may not exist yet on first spawn
    return [];
  }
}

// Allocate next available base port
export async function allocateNextPort(): Promise<number> {
  const allocated = await getAllocatedBasePorts();

  // Find lowest available base port starting from BASE_PORT
  let candidate = BASE_PORT;
  while (allocated.includes(candidate)) {
    candidate += PORT_INCREMENT;
  }

  return candidate;
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
