import { getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import { getLogPath } from "../lib/paths";
import { type ServiceName, isServiceRunning } from "../lib/process";
import { getStateInfo, isDockerRunning } from "../lib/state";

const SERVICE_DESCRIPTIONS: Record<ServiceName, string> = {
  sdk: "SDK TypeScript watcher",
  front: "Next.js frontend",
  core: "Rust core API",
  oauth: "Rust OAuth service",
  connectors: "TypeScript connectors",
  "front-workers": "Temporal workers",
};

const SERVICES: ServiceName[] = ["sdk", "front", "core", "oauth", "connectors", "front-workers"];

async function checkHealthEndpoint(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function printServiceStatus(name: string): Promise<void> {
  console.log("Services:");

  for (const service of SERVICES) {
    const running = await isServiceRunning(name, service);
    const status = running ? "\x1b[32m●\x1b[0m" : "\x1b[90m○\x1b[0m";
    const logPath = getLogPath(name, service);
    console.log(`  ${status} ${service.padEnd(15)} ${SERVICE_DESCRIPTIONS[service]}`);
    if (running) {
      console.log(`    Log: ${logPath}`);
    }
  }
}

interface HealthCheck {
  name: string;
  url: string;
}

async function printHealthChecks(frontPort: number, corePort: number): Promise<void> {
  console.log("Health checks:");

  const checks: HealthCheck[] = [
    { name: "Front", url: `http://localhost:${frontPort}/api/healthz` },
    { name: "Core", url: `http://localhost:${corePort}/` },
  ];

  for (const check of checks) {
    const healthy = await checkHealthEndpoint(check.url);
    const status = healthy ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${status} ${check.name.padEnd(10)} ${check.url}`);
  }
}

export async function statusCommand(name: string): Promise<void> {
  const env = await getEnvironment(name);
  if (!env) {
    logger.error(`Environment '${name}' not found`);
    process.exit(1);
  }

  const stateInfo = await getStateInfo(env);

  console.log();
  console.log(`Environment: ${name}`);
  console.log(`State: ${stateInfo.state}`);
  console.log(`Ports: ${env.ports.base}-${env.ports.base + 999}`);
  console.log(`Branch: ${env.metadata.workspaceBranch}`);
  console.log();

  // Show warnings if any
  if (stateInfo.warnings.length > 0) {
    console.log("\x1b[33mWarnings:\x1b[0m");
    for (const warning of stateInfo.warnings) {
      console.log(`  - ${warning}`);
    }
    console.log();
  }

  await printServiceStatus(name);

  console.log();

  const dockerRunning = await isDockerRunning(name);
  console.log(`Docker: ${dockerRunning ? "\x1b[32mRunning\x1b[0m" : "\x1b[90mStopped\x1b[0m"}`);

  if (stateInfo.state === "warm") {
    console.log();
    await printHealthChecks(env.ports.front, env.ports.core);
  }

  console.log();
}
