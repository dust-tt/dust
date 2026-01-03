import { getDockerProjectName } from "./docker";
import type { Environment } from "./environment";
import type { ServiceName } from "./process";
import { APP_SERVICES, getRunningServices, isServiceRunning } from "./process";

export type EnvironmentState = "stopped" | "cold" | "warm";

export interface StateInfo {
  state: EnvironmentState;
  warnings: string[];
  sdkRunning: boolean;
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

// Determine the base state from running status
function determineState(
  sdkRunning: boolean,
  dockerRunning: boolean,
  appServicesRunning: boolean
): EnvironmentState {
  const nothingRunning = !(sdkRunning || dockerRunning || appServicesRunning);
  if (nothingRunning) {
    return "stopped";
  }

  const onlySdkRunning = sdkRunning && !dockerRunning && !appServicesRunning;
  if (onlySdkRunning) {
    return "cold";
  }

  const allRunning = sdkRunning && dockerRunning && appServicesRunning;
  if (allRunning) {
    return "warm";
  }

  // Inconsistent - consider warm if any infrastructure is running
  return appServicesRunning || dockerRunning ? "warm" : "cold";
}

// Detect warnings for inconsistent states
function detectWarnings(
  sdkRunning: boolean,
  dockerRunning: boolean,
  appServicesRunning: boolean,
  runningAppServices: ServiceName[]
): string[] {
  const warnings: string[] = [];

  const allConsistent =
    !(sdkRunning || dockerRunning || appServicesRunning) ||
    (sdkRunning && !dockerRunning && !appServicesRunning) ||
    (sdkRunning && dockerRunning && appServicesRunning);

  if (allConsistent) {
    return warnings;
  }

  if (!sdkRunning && (dockerRunning || appServicesRunning)) {
    warnings.push("SDK not running");
  }

  if (dockerRunning && !appServicesRunning) {
    warnings.push("Docker running but no app services");
  }

  if (!dockerRunning && appServicesRunning) {
    warnings.push("App services running but Docker is not");
  }

  const missingServices = APP_SERVICES.filter((s) => !runningAppServices.includes(s));
  const hasMissingServices = missingServices.length > 0 && runningAppServices.length > 0;
  if (hasMissingServices) {
    warnings.push(`Missing services: ${missingServices.join(", ")}`);
  }

  return warnings;
}

// Get detailed state info for an environment
export async function getStateInfo(env: Environment): Promise<StateInfo> {
  const sdkRunning = await isServiceRunning(env.name, "sdk");
  const dockerRunning = await isDockerRunning(env.name);
  const runningServices = await getRunningServices(env.name);
  const runningAppServices = runningServices.filter((s) => APP_SERVICES.includes(s));
  const appServicesRunning = runningAppServices.length > 0;

  const state = determineState(sdkRunning, dockerRunning, appServicesRunning);
  const warnings = detectWarnings(
    sdkRunning,
    dockerRunning,
    appServicesRunning,
    runningAppServices
  );

  return {
    state,
    warnings,
    sdkRunning,
    dockerRunning,
    appServicesRunning,
  };
}

// Get simple state string with warning indicator
export function formatState(stateInfo: StateInfo): string {
  const warningIndicator = stateInfo.warnings.length > 0 ? " \u26a0\ufe0f" : "";
  return `${stateInfo.state}${warningIndicator}`;
}
