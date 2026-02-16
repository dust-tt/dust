import { Op } from "sequelize";

import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";

// StatsD metric names.
export const METRICS = {
  COST_THRESHOLD_CROSSED: "agent_loop.cost_threshold_crossed",
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

const COST_WARNING_THRESHOLDS_USD = [10, 50, 100] as const;
const MICRO_USD_PER_USD = 1_000_000;
const COST_THRESHOLD_LOG_TIMEFRAME_SECONDS = 60 * 60 * 24 * 30;

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

interface StepStartEventData extends BaseEventData {
  step: number;
}

interface StepCompletionEventData extends StepStartEventData {
  stepStartTime: number;
}

interface CostThresholdEventData extends StepStartEventData {}

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

// Log warnings when cumulative message cost crosses thresholds.
export async function logAgentLoopCostThresholdWarningsActivity({
  authType,
  eventData,
}: {
  authType: AuthenticatorType;
  eventData: CostThresholdEventData;
}): Promise<void> {
  try {
    const authResult = await Authenticator.fromJSON(authType);
    if (authResult.isErr()) {
      logger.error(
        { error: authResult.error, workspaceId: authType.workspaceId },
        "Failed to deserialize authenticator for cost threshold logging"
      );
      return;
    }

    const auth = authResult.value;
    const workspace = auth.getNonNullableWorkspace();
    const totalCostMicroUsd = await getCumulativeCostMicroUsd(auth, {
      rootAgentMessageId: eventData.agentMessageId,
    });

    if (totalCostMicroUsd <= 0) {
      return;
    }

    const totalCostWithMarkupMicroUsd = Math.ceil(
      totalCostMicroUsd * (1 + DUST_MARKUP_PERCENT / 100)
    );

    for (const thresholdUsd of COST_WARNING_THRESHOLDS_USD) {
      const thresholdMicroUsd = thresholdUsd * MICRO_USD_PER_USD;
      if (totalCostMicroUsd < thresholdMicroUsd) {
        continue;
      }

      const key = `agent_loop_cost_threshold_${workspace.sId}_${eventData.agentMessageId}_${thresholdUsd}`;
      const remaining = await rateLimiter({
        key,
        maxPerTimeframe: 1,
        timeframeSeconds: COST_THRESHOLD_LOG_TIMEFRAME_SECONDS,
        logger,
      });

      if (remaining <= 0) {
        continue;
      }

      logger.warn(
        {
          agentMessageId: eventData.agentMessageId,
          conversationId: eventData.conversationId,
          step: eventData.step,
          thresholdUsd,
          totalCostMicroUsd,
          totalCostWithMarkupMicroUsd,
          workspaceId: workspace.sId,
        },
        "Agent loop cost threshold crossed"
      );

      statsDClient.increment(METRICS.COST_THRESHOLD_CROSSED, 1, [
        `threshold_usd:${thresholdUsd}`,
        `workspace_id:${workspace.sId}`,
      ]);
    }
  } catch (error) {
    logger.error(
      {
        agentMessageId: eventData.agentMessageId,
        conversationId: eventData.conversationId,
        error,
        step: eventData.step,
        workspaceId: authType.workspaceId,
      },
      "Failed to log agent loop cost threshold warnings"
    );
  }
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

async function getCumulativeCostMicroUsd(
  auth: Authenticator,
  { rootAgentMessageId }: { rootAgentMessageId: string }
): Promise<number> {
  const dustRunIds = await collectDescendantRunIds(auth, {
    rootAgentMessageId,
  });

  if (dustRunIds.length === 0) {
    return 0;
  }

  const runResources = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const runUsages = await concurrentExecutor(
    runResources,
    async (runResource) => runResource.listRunUsages(auth),
    { concurrency: 5 }
  );

  return runUsages.flat().reduce((acc, usage) => acc + usage.costMicroUsd, 0);
}

async function collectDescendantRunIds(
  auth: Authenticator,
  { rootAgentMessageId }: { rootAgentMessageId: string }
): Promise<string[]> {
  const workspace = auth.getNonNullableWorkspace();
  const visitedAgentMessageIds = new Set<string>();
  const runIds = new Set<string>();
  let frontierAgentMessageIds = [rootAgentMessageId];

  while (frontierAgentMessageIds.length > 0) {
    const currentFrontier = frontierAgentMessageIds.filter(
      (agentMessageId) => !visitedAgentMessageIds.has(agentMessageId)
    );

    if (currentFrontier.length === 0) {
      break;
    }

    const agentMessageRows = await MessageModel.findAll({
      where: {
        sId: {
          [Op.in]: currentFrontier,
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
        },
      ],
    });

    for (const row of agentMessageRows) {
      visitedAgentMessageIds.add(row.sId);

      const agentMessage = row.agentMessage;
      if (!agentMessage?.runIds) {
        continue;
      }

      for (const runId of agentMessage.runIds) {
        runIds.add(runId);
      }
    }

    const childUserMessageRows = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          where: {
            agenticOriginMessageId: {
              [Op.in]: currentFrontier,
            },
            agenticMessageType: "run_agent",
          },
        },
      ],
    });

    if (childUserMessageRows.length === 0) {
      break;
    }

    const childUserMessageRowIds = childUserMessageRows.map((row) => row.id);
    const childAgentMessageRows = await MessageModel.findAll({
      where: {
        parentId: {
          [Op.in]: childUserMessageRowIds,
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
        },
      ],
    });

    frontierAgentMessageIds = childAgentMessageRows.map((row) => row.sId);
  }

  return [...runIds];
}
