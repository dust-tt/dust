import { getDockerProjectName } from "./docker";
import type { Environment } from "./environment";
import { getRunningServices, isServiceRunning } from "./process";
import { WARM_SERVICES } from "./registry";
import type { ServiceName } from "./services";

export type EnvironmentState = "stopped" | "cold" | "warm";

export interface StateInfo {
  state: EnvironmentState;
  warnings: string[];
  buildWatchersRunning: boolean;
  dockerRunning: boolean;
  appServicesRunning: boolean;
}

// Check if docker containers are running for an environment
export async function isDockerRunning(envName: string): Promise<boolean> {
  const projectName = getDockerProjectName(envName);

  const proc = Bun.spawn(
    ["docker", "compose", "-p", projectName, "ps", "--format", "{{.State}}", "-q"],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return output.trim().length > 0;
}

// Determine the base state from running status (exported for testing)
export function determineState(
  buildWatchersRunning: boolean,
  dockerRunning: boolean,
  appServicesRunning: boolean
): EnvironmentState {
  const nothingRunning = !(buildWatchersRunning || dockerRunning || appServicesRunning);
  if (nothingRunning) {
    return "stopped";
  }

  const onlyBuildWatchersRunning = buildWatchersRunning && !dockerRunning && !appServicesRunning;
  if (onlyBuildWatchersRunning) {
    return "cold";
  }

  const allRunning = buildWatchersRunning && dockerRunning && appServicesRunning;
  if (allRunning) {
    return "warm";
  }

  // Inconsistent - consider warm if any infrastructure is running
  return appServicesRunning || dockerRunning ? "warm" : "cold";
}

// Detect warnings for inconsistent states (exported for testing)
export function detectWarnings(
  buildWatchersRunning: boolean,
  dockerRunning: boolean,
  appServicesRunning: boolean,
  runningAppServices: ServiceName[]
): string[] {
  const warnings: string[] = [];

  const allConsistent =
    !(buildWatchersRunning || dockerRunning || appServicesRunning) ||
    (buildWatchersRunning && !dockerRunning && !appServicesRunning) ||
    (buildWatchersRunning && dockerRunning && appServicesRunning);

  if (allConsistent) {
    return warnings;
  }

  if (!buildWatchersRunning && (dockerRunning || appServicesRunning)) {
    warnings.push("Build watchers not running");
  }

  if (dockerRunning && !appServicesRunning) {
    warnings.push("Docker running but no app services");
  }

  if (!dockerRunning && appServicesRunning) {
    warnings.push("App services running but Docker is not");
  }

  // Check for partially running app services
  const missingServices = WARM_SERVICES.filter((s) => !runningAppServices.includes(s));
  if (missingServices.length > 0 && runningAppServices.length > 0) {
    warnings.push(`Missing services: ${missingServices.join(", ")}`);
  }

  return warnings;
}

// Get detailed state info for an environment
export async function getStateInfo(env: Environment): Promise<StateInfo> {
  const [sparkleRunning, sdkRunning] = await Promise.all([
    isServiceRunning(env.name, "sparkle"),
    isServiceRunning(env.name, "sdk"),
  ]);
  const buildWatchersRunning = sparkleRunning && sdkRunning;
  const dockerRunning = await isDockerRunning(env.name);
  const runningServices = await getRunningServices(env.name);
  const runningAppServices = runningServices.filter((s) => s !== "sparkle" && s !== "sdk");
  const appServicesRunning = runningAppServices.length > 0;

  const state = determineState(buildWatchersRunning, dockerRunning, appServicesRunning);
  const warnings = detectWarnings(
    buildWatchersRunning,
    dockerRunning,
    appServicesRunning,
    runningAppServices
  );

  return {
    state,
    warnings,
    buildWatchersRunning,
    dockerRunning,
    appServicesRunning,
  };
}

// Get simple state string with warning indicator
export function formatState(stateInfo: StateInfo): string {
  const warningIndicator = stateInfo.warnings.length > 0 ? " \u26a0\ufe0f" : "";
  return `${stateInfo.state}${warningIndicator}`;
}
