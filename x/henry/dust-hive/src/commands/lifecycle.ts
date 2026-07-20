import { requireEnvironment } from "../lib/commands";
import { getEnvironment } from "../lib/environment";
import { loadLifecycleState, runLifecycleSweep } from "../lib/lifecycle";
import { touchLifecycleActivity } from "../lib/lifecycle-activity";
import {
  DEFAULT_LIFECYCLE_PROFILE,
  formatDurationSeconds,
  type LifecyclePolicyOverrides,
  loadLifecycleConfig,
  parseDurationSeconds,
  resolveLifecyclePolicy,
  saveLifecycleConfig,
} from "../lib/lifecycle-config";
import {
  getLifecycleDaemonPid,
  startLifecycleDaemon,
  stopLifecycleDaemon,
} from "../lib/lifecycle-daemon";
import { logger } from "../lib/logger";
import { LIFECYCLE_CONFIG_PATH, LIFECYCLE_LOG_PATH } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { getStateInfo } from "../lib/state";

export interface LifecycleEnableOptions {
  profile?: string;
  coldAfter?: string;
  stopAfter?: string;
  deleteAfter?: string;
}

async function buildOverrides(
  options: LifecycleEnableOptions
): Promise<Result<LifecyclePolicyOverrides, CommandError>> {
  const overrides: LifecyclePolicyOverrides = {};
  const durations = [
    ["coldAfterSeconds", options.coldAfter],
    ["stopAfterSeconds", options.stopAfter],
    ["deleteAfterSeconds", options.deleteAfter],
  ] as const;

  for (const [key, value] of durations) {
    if (value === undefined) {
      continue;
    }
    const parsed = parseDurationSeconds(value);
    if (!parsed.ok) {
      return parsed;
    }
    overrides[key] = parsed.value;
  }

  return Ok(overrides);
}

export async function lifecycleEnableCommand(
  nameArg: string | undefined,
  options: LifecycleEnableOptions
): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "enable lifecycle management");
  if (!envResult.ok) {
    return envResult;
  }
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    return configResult;
  }
  const profile = options.profile ?? DEFAULT_LIFECYCLE_PROFILE;
  if (!configResult.value.profiles[profile]) {
    return Err(new CommandError(`Unknown lifecycle profile '${profile}'`));
  }
  const overridesResult = await buildOverrides(options);
  if (!overridesResult.ok) {
    return overridesResult;
  }
  const overrides = overridesResult.value;
  const enrollment = {
    profile,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
  await saveLifecycleConfig({
    ...configResult.value,
    environments: { ...configResult.value.environments, [envResult.value.name]: enrollment },
  });
  await touchLifecycleActivity(envResult.value.name, "command");

  const daemonResult = await startLifecycleDaemon();
  if (!daemonResult.ok) {
    return daemonResult;
  }
  logger.success(
    `Lifecycle management enabled for '${envResult.value.name}' with profile '${profile}'`
  );
  logger.info(`Lifecycle daemon running (PID: ${daemonResult.value})`);
  return Ok(undefined);
}

export async function lifecycleDisableCommand(nameArg: string | undefined): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "disable lifecycle management");
  if (!envResult.ok) {
    return envResult;
  }
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    return configResult;
  }
  const { [envResult.value.name]: removed, ...environments } = configResult.value.environments;
  if (!removed) {
    logger.info(`Lifecycle management is not enabled for '${envResult.value.name}'`);
    return Ok(undefined);
  }
  await saveLifecycleConfig({ ...configResult.value, environments });
  if (Object.keys(environments).length === 0) {
    await stopLifecycleDaemon();
  }
  logger.success(`Lifecycle management disabled for '${envResult.value.name}'`);
  return Ok(undefined);
}

async function printEnvironmentLifecycleStatus(envName: string): Promise<void> {
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    logger.error(configResult.error.message);
    return;
  }
  const enrollment = configResult.value.environments[envName];
  if (!enrollment) {
    console.log(`${envName}: disabled`);
    return;
  }
  const policyResult = resolveLifecyclePolicy(configResult.value, enrollment);
  if (!policyResult.ok) {
    console.log(`${envName}: ${policyResult.error.message}`);
    return;
  }
  const env = await getEnvironment(envName);
  if (!env) {
    console.log(`${envName}: missing`);
    return;
  }
  const stateInfo = await getStateInfo(env);
  const lifecycleState = await loadLifecycleState(envName);
  const policy = policyResult.value;

  console.log();
  console.log(`Environment: ${envName}`);
  console.log(`State: ${stateInfo.state}`);
  console.log(`Profile: ${enrollment.profile}`);
  console.log(`Warm to cold: ${formatDurationSeconds(policy.coldAfterSeconds)}`);
  console.log(`Cold to stopped: ${formatDurationSeconds(policy.stopAfterSeconds)}`);
  console.log(`Stopped to archived: ${formatDurationSeconds(policy.deleteAfterSeconds)}`);
  console.log(`Last activity: ${lifecycleState?.lastActivityAt ?? "not observed yet"}`);
  if (lifecycleState) {
    console.log(`Activity source: ${lifecycleState.lastActivitySource}`);
  }
  if (lifecycleState?.blockedReason) {
    console.log(`Blocked: ${lifecycleState.blockedReason}`);
  }
}

export async function lifecycleStatusCommand(name?: string): Promise<Result<void>> {
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    return configResult;
  }
  const pid = await getLifecycleDaemonPid();
  console.log(`Lifecycle daemon: ${pid === null ? "stopped" : `running (PID: ${pid})`}`);
  console.log(`Config: ${LIFECYCLE_CONFIG_PATH}`);
  console.log(`Log: ${LIFECYCLE_LOG_PATH}`);

  if (name) {
    await printEnvironmentLifecycleStatus(name);
    return Ok(undefined);
  }
  const envNames = Object.keys(configResult.value.environments).sort();
  if (envNames.length === 0) {
    console.log("No environments have lifecycle management enabled.");
    return Ok(undefined);
  }
  for (const envName of envNames) {
    await printEnvironmentLifecycleStatus(envName);
  }
  console.log();
  return Ok(undefined);
}

export async function lifecycleRunOnceCommand(dryRun: boolean): Promise<Result<void>> {
  return runLifecycleSweep({ dryRun });
}

export async function lifecycleStartCommand(): Promise<Result<void>> {
  const result = await startLifecycleDaemon();
  if (!result.ok) {
    return result;
  }
  logger.success(`Lifecycle daemon running (PID: ${result.value})`);
  return Ok(undefined);
}

export async function lifecycleStopCommand(): Promise<Result<void>> {
  const stopped = await stopLifecycleDaemon();
  logger.info(stopped ? "Lifecycle daemon stopped" : "Lifecycle daemon was not running");
  return Ok(undefined);
}
