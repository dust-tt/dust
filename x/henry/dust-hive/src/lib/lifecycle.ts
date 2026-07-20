import { z } from "zod";
import { coolEnvironment } from "../commands/cool";
import { destroySingleEnvironment } from "../commands/destroy";
import { stopEnvironment } from "../commands/stop";
import { type Environment, getEnvironment, getEnvironmentWorktreeDir } from "./environment";
import { getActiveLifecycleActivityLease, getLatestLifecycleActivity } from "./lifecycle-activity";
import {
  type LifecycleConfig,
  type LifecycleEnrollment,
  type LifecyclePolicy,
  loadLifecycleConfig,
  resolveLifecyclePolicy,
  saveLifecycleConfig,
} from "./lifecycle-config";
import { acquireLifecycleLock } from "./lifecycle-lock";
import { getSourceFingerprint } from "./lifecycle-source";
import { logger } from "./logger";
import { getConfiguredMultiplexer, getSessionName } from "./multiplexer";
import { getLifecycleStatePath } from "./paths";
import { CommandError, Err, Ok, type Result } from "./result";
import { loadSettings } from "./settings";
import { type EnvironmentState, getStateInfo } from "./state";
import { hasUncommittedChanges } from "./worktree";

const LifecycleActivitySourceSchema = z.enum(["initial", "source", "command", "frontend", "test"]);
export type LifecycleActivitySource = z.infer<typeof LifecycleActivitySourceSchema>;

const LifecycleStateSchema = z.object({
  observedState: z.enum(["stopped", "cold", "warm"]),
  stateEnteredAt: z.iso.datetime(),
  lastActivityAt: z.iso.datetime(),
  lastActivitySource: LifecycleActivitySourceSchema,
  sourceFingerprint: z.string().nullable(),
  blockedReason: z.string().nullable(),
});

export type LifecycleState = z.infer<typeof LifecycleStateSchema>;
export type LifecycleTransition = "cool" | "stop" | "delete";

function timestampMs(value: string): number {
  return new Date(value).getTime();
}

export function getEligibleLifecycleTransition(
  state: LifecycleState,
  policy: LifecyclePolicy,
  nowMs: number
): LifecycleTransition | null {
  const idleSinceMs = Math.max(
    timestampMs(state.lastActivityAt),
    timestampMs(state.stateEnteredAt)
  );
  const idleDurationSeconds = (nowMs - idleSinceMs) / 1000;

  switch (state.observedState) {
    case "warm":
      return policy.coldAfterSeconds !== null && idleDurationSeconds >= policy.coldAfterSeconds
        ? "cool"
        : null;
    case "cold":
      return policy.stopAfterSeconds !== null && idleDurationSeconds >= policy.stopAfterSeconds
        ? "stop"
        : null;
    case "stopped":
      return policy.deleteAfterSeconds !== null && idleDurationSeconds >= policy.deleteAfterSeconds
        ? "delete"
        : null;
  }
}

export async function loadLifecycleState(envName: string): Promise<LifecycleState | null> {
  const file = Bun.file(getLifecycleStatePath(envName));
  if (!(await file.exists())) {
    return null;
  }

  const data: unknown = await file.json();
  const parsed = LifecycleStateSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid lifecycle state for '${envName}': ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

async function saveLifecycleState(envName: string, state: LifecycleState): Promise<void> {
  await Bun.write(getLifecycleStatePath(envName), JSON.stringify(state, null, 2));
}

function createInitialState(
  actualState: EnvironmentState,
  now: Date,
  sourceFingerprint: string | null
): LifecycleState {
  const nowIso = now.toISOString();
  return {
    observedState: actualState,
    stateEnteredAt: nowIso,
    lastActivityAt: nowIso,
    lastActivitySource: "initial",
    sourceFingerprint,
    blockedReason: null,
  };
}

async function observeActivity(
  env: Environment,
  policy: LifecyclePolicy,
  actualState: EnvironmentState,
  previousState: LifecycleState | null,
  now: Date
): Promise<LifecycleState> {
  const worktreePath = getEnvironmentWorktreeDir(env.metadata);
  const sourceFingerprint = policy.trackSourceChanges
    ? await getSourceFingerprint(worktreePath)
    : null;
  const state = previousState ?? createInitialState(actualState, now, sourceFingerprint);
  const stateAfterObservedTransition: LifecycleState =
    state.observedState === actualState
      ? state
      : {
          ...state,
          observedState: actualState,
          stateEnteredAt: now.toISOString(),
          blockedReason: null,
        };

  let nextState = stateAfterObservedTransition;
  if (
    policy.trackSourceChanges &&
    stateAfterObservedTransition.sourceFingerprint !== null &&
    sourceFingerprint !== stateAfterObservedTransition.sourceFingerprint
  ) {
    nextState = {
      ...nextState,
      lastActivityAt: now.toISOString(),
      lastActivitySource: "source",
    };
  }

  const activityKinds = policy.trackFrontend
    ? (["command", "frontend", "test"] as const)
    : (["command", "test"] as const);
  const externalActivity = await getLatestLifecycleActivity(env.name, [...activityKinds]);
  if (externalActivity && externalActivity.timestampMs > timestampMs(nextState.lastActivityAt)) {
    nextState = {
      ...nextState,
      lastActivityAt: new Date(externalActivity.timestampMs).toISOString(),
      lastActivitySource: externalActivity.kind,
    };
  }

  const activeLease = await getActiveLifecycleActivityLease(env.name);
  if (activeLease) {
    nextState = {
      ...nextState,
      lastActivityAt: now.toISOString(),
      lastActivitySource: activeLease.kind,
    };
  }

  return {
    ...nextState,
    sourceFingerprint,
  };
}

export async function getDeleteBlockReason(
  env: Environment,
  policy: LifecyclePolicy
): Promise<string | null> {
  const worktreePath = getEnvironmentWorktreeDir(env.metadata);
  if (env.metadata.worktreeOwner !== "external" && (await hasUncommittedChanges(worktreePath))) {
    return "worktree has uncommitted changes";
  }

  if (policy.blockDeleteIfSessionExists) {
    const multiplexer = await getConfiguredMultiplexer();
    if (await multiplexer.sessionExists(getSessionName(env.name))) {
      return "terminal session still exists";
    }
  }

  return null;
}

async function removeEnrollment(envName: string): Promise<void> {
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    logger.warn(configResult.error.message);
    return;
  }
  const { [envName]: removed, ...environments } = configResult.value.environments;
  if (!removed) {
    return;
  }
  await saveLifecycleConfig({ ...configResult.value, environments });
}

async function applyTransition(
  env: Environment,
  transition: LifecycleTransition
): Promise<Result<EnvironmentState | "deleted", CommandError>> {
  switch (transition) {
    case "cool": {
      const result = await coolEnvironment(env);
      return result.ok ? Ok("cold") : result;
    }
    case "stop": {
      const result = await stopEnvironment(env);
      return result.ok ? Ok("stopped") : result;
    }
    case "delete": {
      const result = await destroySingleEnvironment(
        env,
        { force: false, keepBranch: true, keepWorktree: false },
        await loadSettings()
      );
      if (!result.ok) {
        return result;
      }
      await removeEnrollment(env.name);
      return Ok("deleted");
    }
  }
}

async function runEnvironmentLifecycle(
  env: Environment,
  policy: LifecyclePolicy,
  dryRun: boolean
): Promise<Result<void, CommandError>> {
  const lock = await acquireLifecycleLock(env.name);
  if (!lock) {
    return Err(new CommandError(`Lifecycle check for '${env.name}' is already running`));
  }

  try {
    const stateInfo = await getStateInfo(env);
    if (stateInfo.warnings.length > 0) {
      return Err(
        new CommandError(`Inconsistent environment state: ${stateInfo.warnings.join(", ")}`)
      );
    }

    const now = new Date();
    let state = await observeActivity(
      env,
      policy,
      stateInfo.state,
      await loadLifecycleState(env.name),
      now
    );
    const transition = getEligibleLifecycleTransition(state, policy, now.getTime());
    if (!transition) {
      await saveLifecycleState(env.name, { ...state, blockedReason: null });
      return Ok(undefined);
    }

    // Close the observation gap before stopping processes or removing resources.
    state = await observeActivity(env, policy, stateInfo.state, state, new Date());
    if (!getEligibleLifecycleTransition(state, policy, Date.now())) {
      await saveLifecycleState(env.name, { ...state, blockedReason: null });
      return Ok(undefined);
    }

    if (transition === "delete") {
      const blockReason = await getDeleteBlockReason(env, policy);
      if (blockReason) {
        await saveLifecycleState(env.name, { ...state, blockedReason: blockReason });
        return Err(new CommandError(blockReason));
      }
    }

    if (dryRun) {
      await saveLifecycleState(env.name, {
        ...state,
        blockedReason: `dry run: would ${transition}`,
      });
      logger.info(`[lifecycle] ${env.name}: would ${transition}`);
      return Ok(undefined);
    }

    const result = await applyTransition(env, transition);
    if (!result.ok) {
      await saveLifecycleState(env.name, { ...state, blockedReason: result.error.message });
      return result;
    }
    if (result.value === "deleted") {
      logger.success(`[lifecycle] ${env.name}: archived`);
      return Ok(undefined);
    }

    const transitionedAt = new Date().toISOString();
    await saveLifecycleState(env.name, {
      ...state,
      observedState: result.value,
      stateEnteredAt: transitionedAt,
      blockedReason: null,
    });
    logger.success(`[lifecycle] ${env.name}: ${transitionedAt} ${transition}`);
    return Ok(undefined);
  } finally {
    await lock.release();
  }
}

async function runEnrolledEnvironment(
  envName: string,
  enrollment: LifecycleEnrollment,
  config: LifecycleConfig,
  dryRun: boolean
): Promise<Result<void, CommandError>> {
  const env = await getEnvironment(envName);
  if (!env) {
    await removeEnrollment(envName);
    logger.warn(`[lifecycle] ${envName}: removed enrollment for missing environment`);
    return Ok(undefined);
  }
  const policyResult = resolveLifecyclePolicy(config, enrollment);
  if (!policyResult.ok) {
    return policyResult;
  }
  return runEnvironmentLifecycle(env, policyResult.value, dryRun);
}

export async function runLifecycleSweep(options: { dryRun?: boolean } = {}): Promise<Result<void>> {
  const configResult = await loadLifecycleConfig();
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;
  const dryRun = options.dryRun ?? config.dryRun;
  const failures: string[] = [];

  for (const [envName, enrollment] of Object.entries(config.environments)) {
    // One broken environment must not prevent resource reclamation for the others.
    try {
      const result = await runEnrolledEnvironment(envName, enrollment, config, dryRun);
      if (!result.ok) {
        failures.push(`${envName}: ${result.error.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${envName}: ${message}`);
    }
  }

  if (failures.length > 0) {
    return Err(new CommandError(`Lifecycle sweep failed: ${failures.join("; ")}`));
  }
  return Ok(undefined);
}
