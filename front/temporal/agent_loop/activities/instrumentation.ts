import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";

// StatsD metric names.
const METRICS = {
  LOOP_COMPLETIONS: "agent_loop.completions",
  LOOP_DURATION: "agent_loop.duration_ms",
  LOOP_STARTS: "agent_loop.starts",
  PHASE_COMPLETIONS: "agent_loop_phase.completions",
  PHASE_DURATION: "agent_loop_phase.duration_ms",
  PHASE_STARTS: "agent_loop_phase.starts",
  PHASE_STEPS: "agent_loop_phase.steps_completed",
  PHASE_SYNC_TIMEOUTS: "agent_loop_phase.sync_timeouts",
  PHASE_TIMEOUT_DURATION: "agent_loop_phase.timeout_duration_ms",
  PHASE_TIMEOUT_STEPS: "agent_loop_phase.timeout_steps",
  STEP_COMPLETIONS: "agent_loop_step.completions",
  STEP_DURATION: "agent_loop_step.duration_ms",
  STEP_STARTS: "agent_loop_step.starts",
} as const;

/**
 * Agent Loop Instrumentation
 *
 * THREE-LEVEL METRICS SYSTEM:
 *
 * 1. **STEP** = Individual model execution + tool(s) execution within a phase
 * 2. **PHASE** = Single execution of `executeAgentLoop` function (contains multiple steps)
 * 3. **LOOP** = Complete agent processing (may span multiple phases)
 *
 * EXAMPLES:
 * - Sync completion: N steps → 1 phase → 1 loop
 * - Sync→async transition: N steps → 2 phases → 1 loop
 * - Approval interruption: N steps → M phases → 1 loop (excludes user wait time)
 *
 * TIMING PARAMETERS:
 * - stepStartTime: When current step started (model + tools execution)
 * - syncStartTime: When current phase started (used for phase duration)
 * - initialStartTime: When agent processing originally began (used for loop duration)
 *
 * METRICS:
 * - `agent_loop_step.*` → Individual step performance (model + tools)
 * - `agent_loop_phase.*` → Individual `executeAgentLoop` performance
 * - `agent_loop.*` → Complete agent loop performance
 *
 * Note: Functions are async because they're used as Temporal activities.
 */

interface BaseEventData {
  agentMessageId: string;
  conversationId: string;
}

interface StartEventData extends BaseEventData {
  startStep: number;
}

interface CompletionEventData extends BaseEventData {
  initialStartTime?: number;
  stepsCompleted: number;
  syncStartTime: number;
}

interface TimeoutEventData extends BaseEventData {
  currentStep: number;
  phaseDurationMs: number;
  stepsCompleted: number;
}

interface StepStartEventData extends BaseEventData {
  step: number;
}

interface StepCompletionEventData extends StepStartEventData {
  stepStartTime: number;
}

/**
 * Loop Instrumentation
 *
 * Tracks complete agent loop processing that may span multiple phases.
 */

// Log start of complete agent loop - only called once per loop.
export function logAgentLoopStart(): void {
  statsDClient.increment(METRICS.LOOP_STARTS, 1);
}

/**
 * Phase Instrumentation
 *
 * Tracks individual executeAgentLoop calls.
 */

// Log start of individual phase - called for each executeAgentLoop execution.
export async function logAgentLoopPhaseStartActivity({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: StartEventData;
}): Promise<void> {
  const baseLogData = createBaseLogData(authType, eventData);

  logger.info(
    {
      ...baseLogData,
      startStep: eventData.startStep,
    },
    "Agent loop phase execution started"
  );

  statsDClient.increment(METRICS.PHASE_STARTS, 1);
}

// Logs both phase completion and loop completion metrics.
export async function logAgentLoopPhaseCompletionActivity({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: CompletionEventData;
}): Promise<void> {
  const baseLogData = createBaseLogData(authType, eventData);
  const { phaseDurationMs, totalDurationMs } = calculateDurations(
    eventData.syncStartTime,
    eventData.initialStartTime
  );

  logger.info(
    {
      ...baseLogData,
      phaseDurationMs,
      totalDurationMs,
      stepsCompleted: eventData.stepsCompleted,
    },
    "Agent loop execution completed"
  );

  logAgentLoopPhaseCompletion({
    phaseDurationMs,
    stepsCompleted: eventData.stepsCompleted,
  });

  statsDClient.increment(METRICS.LOOP_COMPLETIONS, 1);
  statsDClient.distribution(METRICS.LOOP_DURATION, totalDurationMs);
}

// Logs phase timeout when sync execution switches to async due to timeout.
export function logAgentLoopPhaseTimeout({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: TimeoutEventData;
}): void {
  const baseLogData = createBaseLogData(authType, eventData);

  logger.info(
    {
      ...baseLogData,
      currentStep: eventData.currentStep,
      phaseDurationMs: eventData.phaseDurationMs,
      stepsCompleted: eventData.stepsCompleted,
    },
    "Agent loop sync timeout - switching to async"
  );

  logAgentLoopPhaseCompletion(eventData);

  statsDClient.increment(METRICS.PHASE_SYNC_TIMEOUTS);
  statsDClient.distribution(
    METRICS.PHASE_TIMEOUT_DURATION,
    eventData.phaseDurationMs
  );
  statsDClient.histogram(METRICS.PHASE_TIMEOUT_STEPS, eventData.currentStep);
}

/**
 * Step Instrumentation
 *
 * Tracks individual step execution (model + tools) within phases.
 */

// Log step start - called at the beginning of runModelAndCreateActionsActivity.
export function logAgentLoopStepStart(eventData: StepStartEventData): number {
  const stepStartTime = Date.now();

  statsDClient.increment(METRICS.STEP_STARTS, 1, [`step:${eventData.step}`]);

  return stepStartTime;
}

// Log step completion - called after tools are executed.
export async function logAgentLoopStepCompletionActivity(
  eventData: StepCompletionEventData
): Promise<void> {
  const stepDurationMs = Date.now() - eventData.stepStartTime;

  const tags = [`step:${eventData.step}`];

  statsDClient.increment(METRICS.STEP_COMPLETIONS, 1, tags);
  statsDClient.distribution(METRICS.STEP_DURATION, stepDurationMs, tags);
}

/**
 * Helper functions.
 */

function logAgentLoopPhaseCompletion(
  eventData: Pick<CompletionEventData, "stepsCompleted"> & {
    phaseDurationMs: number;
  }
): void {
  statsDClient.increment(METRICS.PHASE_COMPLETIONS, 1);
  statsDClient.distribution(METRICS.PHASE_DURATION, eventData.phaseDurationMs);
  statsDClient.histogram(METRICS.PHASE_STEPS, eventData.stepsCompleted);
}

function calculateDurations(syncStartTime: number, initialStartTime?: number) {
  const now = Date.now();
  const phaseDurationMs = now - syncStartTime;
  const totalDurationMs = initialStartTime
    ? now - initialStartTime
    : phaseDurationMs;
  return { phaseDurationMs, totalDurationMs };
}

function createBaseLogData(
  authType: AuthenticatorType,
  eventData: BaseEventData
) {
  return {
    agentMessageId: eventData.agentMessageId,
    conversationId: eventData.conversationId,
    workspaceId: authType.workspaceId,
  };
}
