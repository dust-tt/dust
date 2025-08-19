import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";

/**
 * Agent Loop Instrumentation
 *
 * A "phase" is a single execution of `executeAgentLoop`. An agent message may require multiple
 * phases due to sync→async transitions or approval interruptions.
 *
 * Two-level metrics:
 * - `agent_loop_phase.*` - Individual `executeAgentLoop` calls (one phase each)
 * - `agent_loop_end_to_end.*` - Complete agent processing (spans multiple phases for sync→async)
 *
 * Key metrics:
 * - `agent_loop_phase.duration_ms` → P90 of individual phase executions
 * - `agent_loop_end_to_end.duration_ms` → P90 including sync→async transitions
 *
 * Note: All functions are async because they're used in Temporal workflows where only async
 * functions can be called as activities.
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

export function logAgentLoopStart(eventData: StartEventData): void {
  statsDClient.increment("agent_loop_end_to_end.starts", 1, [
    `execution_mode:${eventData.executionMode}`,
  ]);
}

export async function logAgentLoopPhaseStartActivity({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: StartEventData;
}): Promise<void> {
  const baseLogData = {
    agentMessageId: eventData.agentMessageId,
    conversationId: eventData.conversationId,
    executionMode: eventData.executionMode,
    workspaceId: authType.workspaceId,
  };

  logger.info(
    {
      ...baseLogData,
      startStep: eventData.startStep,
    },
    "Agent loop phase execution started"
  );

  statsDClient.increment("agent_loop_phase.starts", 1, [
    `execution_mode:${eventData.executionMode}`,
  ]);
}

export async function logAgentLoopCompletionActivity({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: CompletionEventData;
}): Promise<void> {
  const baseLogData = {
    agentMessageId: eventData.agentMessageId,
    conversationId: eventData.conversationId,
    executionMode: eventData.executionMode,
    workspaceId: authType.workspaceId,
  };

  const now = Date.now();
  const phaseDurationMs = now - eventData.syncStartTime;
  const totalDurationMs = eventData.initialStartTime
    ? now - eventData.initialStartTime
    : phaseDurationMs;

  logger.info(
    {
      ...baseLogData,
      phaseDurationMs,
      totalDurationMs,
      stepsCompleted: eventData.stepsCompleted,
    },
    "Agent loop execution completed"
  );

  // Phase-level metrics.
  logAgentLoopPhaseCompletion({
    executionMode: eventData.executionMode,
    phaseDurationMs,
    stepsCompleted: eventData.stepsCompleted,
  });

  // End-to-end execution metrics.
  statsDClient.increment("agent_loop_end_to_end.completions", 1, [
    `execution_mode:${eventData.executionMode}`,
  ]);
  statsDClient.histogram("agent_loop_end_to_end.duration_ms", totalDurationMs, [
    `execution_mode:${eventData.executionMode}`,
  ]);
}

export function logAgentLoopPhaseTimeout({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: TimeoutEventData;
}): void {
  const baseLogData = {
    agentMessageId: eventData.agentMessageId,
    conversationId: eventData.conversationId,
    executionMode: eventData.executionMode,
    workspaceId: authType.workspaceId,
  };

  logger.info(
    {
      ...baseLogData,
      currentStep: eventData.currentStep,
      phaseDurationMs: eventData.phaseDurationMs,
      stepsCompleted: eventData.stepsCompleted,
    },
    "Agent loop sync timeout - switching to async"
  );

  // Phase completion metrics (timeout is considered as a form of completion).
  logAgentLoopPhaseCompletion(eventData);

  // Timeout-specific metrics.
  statsDClient.increment("agent_loop_phase.sync_timeouts");
  statsDClient.histogram(
    "agent_loop_phase.timeout_duration_ms",
    eventData.phaseDurationMs
  );
  statsDClient.histogram(
    "agent_loop_phase.timeout_steps",
    eventData.currentStep
  );
}

function logAgentLoopPhaseCompletion(
  eventData: Pick<CompletionEventData, "executionMode" | "stepsCompleted"> & {
    phaseDurationMs: number;
  }
): void {
  statsDClient.increment("agent_loop_phase.completions", 1, [
    `execution_mode:${eventData.executionMode}`,
  ]);
  statsDClient.histogram(
    "agent_loop_phase.duration_ms",
    eventData.phaseDurationMs,
    [`execution_mode:${eventData.executionMode}`]
  );
  statsDClient.histogram(
    "agent_loop_phase.steps_completed",
    eventData.stepsCompleted,
    [`execution_mode:${eventData.executionMode}`]
  );
}
