import { requireEnvironment } from "../lib/commands";
import { getLogPath } from "../lib/paths";
import type { PortAllocation } from "../lib/ports";
import { isServiceRunning } from "../lib/process";
import { checkServiceHealth, getHealthChecks } from "../lib/registry";
import { Ok, type Result } from "../lib/result";
import { ALL_SERVICES } from "../lib/services";
import { getStateInfo, isDockerRunning } from "../lib/state";

async function printServiceStatus(name: string): Promise<void> {
  console.log("Services:");

  for (const service of ALL_SERVICES) {
    const running = await isServiceRunning(name, service);
    const status = running ? "\x1b[32m●\x1b[0m" : "\x1b[90m○\x1b[0m";
    console.log(`  ${status} ${service}`);
    if (running) {
      console.log(`    Log: ${getLogPath(name, service)}`);
    }
  }
}

async function printHealthChecks(ports: PortAllocation): Promise<void> {
  console.log("Health checks:");

  const checks = getHealthChecks(ports);
  for (const check of checks) {
    const healthy = await checkServiceHealth(check.service, ports);
    const status = healthy ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${status} ${check.service.padEnd(10)} ${check.url}`);
  }
}

export async function statusCommand(name: string): Promise<Result<void>> {
  const envResult = await requireEnvironment(name, "status");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
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
    await printHealthChecks(env.ports);
  }

  console.log();

  return Ok(undefined);
}
