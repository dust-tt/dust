import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";

// StatsD metric names.
const METRICS = {
  LOOP_COMPLETIONS: "agent_loop_loop.completions",
  LOOP_DURATION: "agent_loop_loop.duration_ms",
  LOOP_STARTS: "agent_loop_loop.starts",
  PHASE_COMPLETIONS: "agent_loop_phase.completions",
  PHASE_DURATION: "agent_loop_phase.duration_ms",
  PHASE_STARTS: "agent_loop_phase.starts",
  PHASE_STEPS: "agent_loop_phase.steps_completed",
  PHASE_SYNC_TIMEOUTS: "agent_loop_phase.sync_timeouts",
  PHASE_TIMEOUT_DURATION: "agent_loop_phase.timeout_duration_ms",
  PHASE_TIMEOUT_STEPS: "agent_loop_phase.timeout_steps",
} as const;

/**
 * Agent Loop Instrumentation
 *
 * PHASE vs LOOP METRICS:
 *
 * A "phase" = single execution of `executeAgentLoop` function
 * A "loop" = complete agent loop processing (may span multiple phases)
 *
 * EXAMPLES:
 * 1. Sync completion: 1 phase = 1 loop (same duration)
 * 2. Sync→async transition: 2 phases, 1 loop (loop duration = sum of both phases)
 *
 * TIMING PARAMETERS:
 * - syncStartTime: When current phase started (used for phase duration)
 * - initialStartTime: When agent processing originally began (used for loop duration)
 *
 * METRICS:
 * - `agent_loop_phase.*` → Individual `executeAgentLoop` performance
 * - `agent_loop_loop.*` → Complete agent loop processing performance
 *
 * Note: Functions are async because they're used as Temporal activities.
 */

interface BaseEventData {
  agentMessageId: string;
  conversationId: string;
  executionMode: "sync" | "async";
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

/**
 * Loop Instrumentation
 *
 * Tracks complete agent loop processing that may span multiple phases.
 */

export function logAgentLoopStart(eventData: StartEventData): void {
  // Log start of complete agent loop - only called once per loop.
  statsDClient.increment(
    METRICS.LOOP_STARTS,
    1,
    createExecutionModeTag(eventData.executionMode)
  );
}

/**
 * Phase Instrumentation
 *
 * Tracks individual executeAgentLoop calls.
 */

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

  // Log start of individual phase - called for each executeAgentLoop execution.
  statsDClient.increment(
    METRICS.PHASE_STARTS,
    1,
    createExecutionModeTag(eventData.executionMode)
  );
}

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

  // Phase-level metrics - tracks individual executeAgentLoop performance.
  logAgentLoopPhaseCompletion({
    executionMode: eventData.executionMode,
    phaseDurationMs,
    stepsCompleted: eventData.stepsCompleted,
  });

  // Loop metrics - tracks complete agent loop processing from start to finish.
  statsDClient.increment(
    METRICS.LOOP_COMPLETIONS,
    1,
    createExecutionModeTag(eventData.executionMode)
  );
  statsDClient.histogram(
    METRICS.LOOP_DURATION,
    totalDurationMs,
    createExecutionModeTag(eventData.executionMode)
  );
}

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

  // Phase completion metrics - sync phase is "done" even though it timed out.
  logAgentLoopPhaseCompletion(eventData);

  // Timeout-specific metrics.
  statsDClient.increment(METRICS.PHASE_SYNC_TIMEOUTS);
  statsDClient.histogram(
    METRICS.PHASE_TIMEOUT_DURATION,
    eventData.phaseDurationMs
  );
  statsDClient.histogram(METRICS.PHASE_TIMEOUT_STEPS, eventData.currentStep);
}

/**
 * Helper functions.
 */

function logAgentLoopPhaseCompletion(
  eventData: Pick<CompletionEventData, "executionMode" | "stepsCompleted"> & {
    phaseDurationMs: number;
  }
): void {
  const tags = createExecutionModeTag(eventData.executionMode);

  statsDClient.increment(METRICS.PHASE_COMPLETIONS, 1, tags);
  statsDClient.histogram(
    METRICS.PHASE_DURATION,
    eventData.phaseDurationMs,
    tags
  );
  statsDClient.histogram(METRICS.PHASE_STEPS, eventData.stepsCompleted, tags);
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
    executionMode: eventData.executionMode,
    workspaceId: authType.workspaceId,
  };
}

function createExecutionModeTag(executionMode: string) {
  return [`execution_mode:${executionMode}`];
}
