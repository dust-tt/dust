// Service registry - centralized configuration for all services

import type { Environment } from "./environment";
import { logger } from "./logger";
import { getEnvFilePath, getWorktreeDir } from "./paths";
import type { PortAllocation } from "./ports";
import { isServiceRunning, spawnShellDaemon } from "./process";
import type { ServiceName } from "./services";
import { buildShell } from "./shell";

// Service configuration
export interface ServiceConfig {
  // Working directory relative to worktree (e.g., "front", "core", "sdks/js")
  cwd: string;
  // Whether this service needs nvm sourced
  needsNvm: boolean;
  // Whether this service needs env.sh sourced
  needsEnvSh: boolean;
  // Build the start command (receives environment for port info)
  buildCommand: (env: Environment) => string;
  // Health check URL builder (optional, receives ports)
  healthCheckUrl?: (ports: PortAllocation) => string;
  // Port key from PortAllocation (for display purposes)
  portKey?: keyof PortAllocation;
}

// Service registry - defines how each service runs
export const SERVICE_REGISTRY: Record<ServiceName, ServiceConfig> = {
  sdk: {
    cwd: "sdks/js",
    needsNvm: true,
    needsEnvSh: false,
    buildCommand: () => "npm run watch",
  },
  front: {
    cwd: "front",
    needsNvm: true,
    needsEnvSh: true,
    buildCommand: () => "npm run dev",
    healthCheckUrl: (ports) => `http://localhost:${ports.front}/api/healthz`,
    portKey: "front",
  },
  core: {
    cwd: "core",
    needsNvm: false,
    needsEnvSh: true,
    buildCommand: () => "cargo run --bin core-api",
    healthCheckUrl: (ports) => `http://localhost:${ports.core}/`,
    portKey: "core",
  },
  oauth: {
    cwd: "core",
    needsNvm: false,
    needsEnvSh: true,
    buildCommand: () => "cargo run --bin oauth",
    portKey: "oauth",
  },
  connectors: {
    cwd: "connectors",
    needsNvm: true,
    needsEnvSh: true,
    buildCommand: (env) =>
      `TEMPORAL_NAMESPACE=dust-hive-${env.name}-connectors npx tsx src/start.ts -p ${env.ports.connectors}`,
    portKey: "connectors",
  },
  "front-workers": {
    cwd: "front",
    needsNvm: true,
    needsEnvSh: true,
    buildCommand: () => "./admin/dev_worker.sh",
  },
};

// Services to start during warm (all services except SDK, which starts at spawn)
export const WARM_SERVICES: ServiceName[] = (Object.keys(SERVICE_REGISTRY) as ServiceName[]).filter(
  (s) => s !== "sdk"
);

// Build the full shell command for a service
function buildServiceCommand(env: Environment, service: ServiceName): string {
  const config = SERVICE_REGISTRY[service];

  if (config.needsEnvSh) {
    return buildShell({
      sourceEnv: getEnvFilePath(env.name),
      sourceNvm: config.needsNvm,
      run: config.buildCommand(env),
    });
  }

  return buildShell({
    sourceNvm: config.needsNvm,
    run: config.buildCommand(env),
  });
}

// Get the working directory for a service
function getServiceCwd(env: Environment, service: ServiceName): string {
  const config = SERVICE_REGISTRY[service];
  const worktreePath = getWorktreeDir(env.name);
  return `${worktreePath}/${config.cwd}`;
}

// Start a single service (assumes dependencies are already running)
export async function startService(env: Environment, service: ServiceName): Promise<void> {
  if (await isServiceRunning(env.name, service)) {
    logger.info(`${service} already running`);
    return;
  }

  logger.step(`Starting ${service}...`);

  const command = buildServiceCommand(env, service);
  const cwd = getServiceCwd(env, service);

  await spawnShellDaemon(env.name, service, command, { cwd });
  logger.success(`${service} started`);
}

// Check if a service is healthy via HTTP
export async function checkServiceHealth(
  service: ServiceName,
  ports: PortAllocation,
  timeoutMs = 2000
): Promise<boolean> {
  const config = SERVICE_REGISTRY[service];
  if (!config.healthCheckUrl) {
    return true; // No health check defined, assume healthy if running
  }

  const url = config.healthCheckUrl(ports);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    // Network error or timeout means service is not healthy
    return false;
  }
}

// Wait for a service to become healthy
export async function waitForServiceHealth(
  service: ServiceName,
  ports: PortAllocation,
  timeoutMs = 120000
): Promise<void> {
  const config = SERVICE_REGISTRY[service];
  if (!config.healthCheckUrl) {
    return; // No health check, nothing to wait for
  }

  const url = config.healthCheckUrl(ports);
  logger.step(`Waiting for ${service} to be healthy...`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        logger.success(`${service} is healthy`);
        return;
      }
    } catch {
      // Network error or timeout - service not ready yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`${service} health check timed out`);
}

// Get health checks for all services
export function getHealthChecks(
  ports: PortAllocation
): Array<{ service: ServiceName; url: string }> {
  const checks: Array<{ service: ServiceName; url: string }> = [];

  for (const [service, config] of Object.entries(SERVICE_REGISTRY)) {
    if (config.healthCheckUrl) {
      checks.push({
        service: service as ServiceName,
        url: config.healthCheckUrl(ports),
      });
    }
  }

  return checks;
}

// Get the port for a service (for display purposes)
export function getServicePort(service: ServiceName, ports: PortAllocation): number | undefined {
  const config = SERVICE_REGISTRY[service];
  if (!config.portKey) {
    return undefined;
  }
  return ports[config.portKey];
}
