// Service registry - centralized configuration for all services

import { stat } from "node:fs/promises";
import type { Environment } from "./environment";
import { type RustServiceBinary, getRustBinaryPath, rustBinaryExists } from "./init";
import { logger } from "./logger";
import { getEnvFilePath, getLogPath, getWorktreeDir } from "./paths";
import type { PortAllocation } from "./ports";
import { isServiceRunning, readFileTail, spawnShellDaemon } from "./process";
import { ALL_SERVICES, type ServiceName } from "./services";
import { buildShell } from "./shell";

// Readiness check types - how to determine if a service is ready
export type ReadinessCheck =
  | { type: "http"; url: (ports: PortAllocation) => string }
  | { type: "file"; path: (env: Environment) => string };

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
  // Readiness check (optional) - how to determine if service is ready
  readinessCheck?: ReadinessCheck;
  // Port key from PortAllocation (for display purposes)
  portKey?: keyof PortAllocation;
  // Rust binary name (if this service can run a pre-compiled binary)
  rustBinary?: RustServiceBinary;
}

// Service registry - defines how each service runs
export const SERVICE_REGISTRY: Record<ServiceName, ServiceConfig> = {
  sdk: {
    cwd: "sdks/js",
    needsNvm: true,
    needsEnvSh: false,
    buildCommand: () => "npm run watch",
    readinessCheck: {
      type: "file",
      path: (env) => `${getWorktreeDir(env.name)}/sdks/js/dist/client.esm.js`,
    },
  },
  front: {
    cwd: "front",
    needsNvm: true,
    needsEnvSh: true,
    buildCommand: () => "npm run dev",
    readinessCheck: {
      type: "http",
      url: (ports) => `http://localhost:${ports.front}/api/healthz`,
    },
    portKey: "front",
  },
  core: {
    cwd: "core",
    needsNvm: false,
    needsEnvSh: true,
    buildCommand: () => "cargo run --bin core-api",
    readinessCheck: {
      type: "http",
      url: (ports) => `http://localhost:${ports.core}/`,
    },
    portKey: "core",
    rustBinary: "core-api",
  },
  oauth: {
    cwd: "core",
    needsNvm: false,
    needsEnvSh: true,
    buildCommand: () => "cargo run --bin oauth",
    readinessCheck: {
      type: "http",
      url: (ports) => `http://localhost:${ports.oauth}/`,
    },
    portKey: "oauth",
    rustBinary: "oauth",
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

const registryKeys = Object.keys(SERVICE_REGISTRY) as ServiceName[];
const missingKeys = ALL_SERVICES.filter((service) => !registryKeys.includes(service));
const extraKeys = registryKeys.filter((service) => !ALL_SERVICES.includes(service));
if (missingKeys.length > 0 || extraKeys.length > 0) {
  throw new Error(
    `SERVICE_REGISTRY mismatch. Missing: ${missingKeys.join(", ") || "none"}. Extra: ${
      extraKeys.join(", ") || "none"
    }.`
  );
}

// Services to start during warm (all services except SDK, which starts at spawn)
export const WARM_SERVICES: ServiceName[] = ALL_SERVICES.filter((service) => service !== "sdk");

// Build the full shell command for a service
// For Rust services with pre-compiled binaries, runs the binary directly
// Otherwise falls back to cargo run for compilation
async function buildServiceCommand(
  env: Environment,
  service: ServiceName,
  usePrecompiledBinary = false
): Promise<string> {
  const config = SERVICE_REGISTRY[service];
  const worktreePath = getWorktreeDir(env.name);

  // Check if we should use a pre-compiled binary
  let command = config.buildCommand(env);
  if (usePrecompiledBinary && config.rustBinary) {
    const binaryExists = await rustBinaryExists(worktreePath, config.rustBinary);
    if (binaryExists) {
      const binaryPath = getRustBinaryPath(worktreePath, config.rustBinary);
      command = binaryPath;
    }
  }

  if (config.needsEnvSh) {
    return buildShell({
      sourceEnv: getEnvFilePath(env.name),
      sourceNvm: config.needsNvm,
      run: command,
    });
  }

  return buildShell({
    sourceNvm: config.needsNvm,
    run: command,
  });
}

// Get the working directory for a service
function getServiceCwd(env: Environment, service: ServiceName): string {
  const config = SERVICE_REGISTRY[service];
  const worktreePath = getWorktreeDir(env.name);
  return `${worktreePath}/${config.cwd}`;
}

// Start a single service (assumes dependencies are already running)
// If usePrecompiledBinary is true and the binary exists, runs it directly
export async function startService(
  env: Environment,
  service: ServiceName,
  usePrecompiledBinary = false
): Promise<void> {
  if (await isServiceRunning(env.name, service)) {
    logger.info(`${service} already running`);
    return;
  }

  logger.step(`Starting ${service}...`);

  const command = await buildServiceCommand(env, service, usePrecompiledBinary);
  const cwd = getServiceCwd(env, service);

  await spawnShellDaemon(env.name, service, command, { cwd });
  logger.success(`${service} started`);
}

// Check if a service is healthy (for services with HTTP readiness check)
export async function checkServiceHealth(
  service: ServiceName,
  ports: PortAllocation,
  timeoutMs = 2000
): Promise<boolean> {
  const config = SERVICE_REGISTRY[service];
  if (!config.readinessCheck || config.readinessCheck.type !== "http") {
    return true; // No HTTP health check defined, assume healthy if running
  }

  const url = config.readinessCheck.url(ports);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    // Network error or timeout means service is not healthy
    return false;
  }
}

// Wait for HTTP service to become healthy
async function waitForHttpReady(
  service: ServiceName,
  url: string,
  timeoutMs: number
): Promise<void> {
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

// Wait for file-based service (like SDK build) to be ready
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex build wait with error detection
async function waitForFileReady(
  service: ServiceName,
  env: Environment,
  targetPath: string,
  timeoutMs: number
): Promise<void> {
  logger.step(`Waiting for ${service} to build...`);

  const logFile = getLogPath(env.name, service);
  const start = Date.now();
  const checkInterval = 500;
  let lastLogSize = 0;

  while (Date.now() - start < timeoutMs) {
    // Check if build output exists
    const targetFile = Bun.file(targetPath);
    if (await targetFile.exists()) {
      logger.success(`${service} build complete`);
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
          throw new Error(`${service} build failed:\n${errorLines}`);
        }
      }
    }

    // Check if process is still running
    if (!(await isServiceRunning(env.name, service))) {
      const logContent = (await log.exists()) ? await log.text() : "No log available";
      throw new Error(`${service} process exited unexpectedly. Log:\n${logContent.slice(-500)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  throw new Error(`${service} build timed out after ${timeoutMs / 1000}s`);
}

// Wait for a service to become ready (unified function for all readiness check types)
export async function waitForServiceReady(
  env: Environment,
  service: ServiceName,
  timeoutMs = 120000
): Promise<void> {
  const config = SERVICE_REGISTRY[service];
  if (!config.readinessCheck) {
    return; // No readiness check, nothing to wait for
  }

  const check = config.readinessCheck;
  if (check.type === "http") {
    return waitForHttpReady(service, check.url(env.ports), timeoutMs);
  }
  // check.type === "file"
  return waitForFileReady(service, env, check.path(env), timeoutMs);
}

// Get HTTP health checks for all services (for status display)
export function getHealthChecks(
  ports: PortAllocation
): Array<{ service: ServiceName; url: string }> {
  const checks: Array<{ service: ServiceName; url: string }> = [];

  for (const [service, config] of Object.entries(SERVICE_REGISTRY)) {
    if (config.readinessCheck?.type === "http") {
      checks.push({
        service: service as ServiceName,
        url: config.readinessCheck.url(ports),
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
