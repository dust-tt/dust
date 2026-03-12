import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

import { METRICS } from "@app/temporal/agent_loop/activities/instrumentation";
import type { InjectedSinks } from "@temporalio/worker";
import type { Sinks } from "@temporalio/workflow";

/**
 * Sink interface for agent loop instrumentation.
 *
 * Fire-and-forget sinks that don't record in workflow history, don't consume activity slots,
 * and run on the same worker with callDuringReplay: false.
 *
 * All arguments must be primitives (structured clone constraint).
 */
export interface AgentLoopInstrumentationSinks extends Sinks {
  metrics: {
    logPhaseStart(
      workspaceId: string,
      agentMessageId: string,
      conversationId: string,
      startStep: number
    ): void;

    logStepCompletion(
      agentMessageId: string,
      conversationId: string,
      step: number,
      stepStartTime: number
    ): void;

    logPhaseCompletion(
      workspaceId: string,
      agentMessageId: string,
      conversationId: string,
      initialStartTime: number | undefined,
      stepsCompleted: number,
      syncStartTime: number
    ): void;
  };
}

export const instrumentationSinks: InjectedSinks<AgentLoopInstrumentationSinks> =
  {
    metrics: {
      logPhaseStart: {
        fn(
          _info,
          workspaceId: string,
          agentMessageId: string,
          conversationId: string,
          startStep: number
        ) {
          logger.info(
            { workspaceId, agentMessageId, conversationId, startStep },
            "Agent loop phase execution started"
          );
          getStatsDClient().increment(METRICS.PHASE_STARTS, 1);
        },
      },
      logStepCompletion: {
        fn(
          _info,
          _agentMessageId: string,
          _conversationId: string,
          step: number,
          stepStartTime: number
        ) {
          const stepDurationMs = Date.now() - stepStartTime;
          const tags = [`step:${step}`];

          getStatsDClient().increment(METRICS.STEP_STARTS, 1, tags);
          getStatsDClient().increment(METRICS.STEP_COMPLETIONS, 1, tags);
          getStatsDClient().distribution(
            METRICS.STEP_DURATION,
            stepDurationMs,
            tags
          );
        },
      },
      logPhaseCompletion: {
        fn(
          _info,
          workspaceId: string,
          agentMessageId: string,
          conversationId: string,
          initialStartTime: number | undefined,
          stepsCompleted: number,
          syncStartTime: number
        ) {
          const now = Date.now();
          const phaseDurationMs = now - syncStartTime;
          const totalDurationMs = initialStartTime
            ? now - initialStartTime
            : phaseDurationMs;

          logger.info(
            {
              workspaceId,
              agentMessageId,
              conversationId,
              phaseDurationMs,
              totalDurationMs,
              stepsCompleted,
            },
            "Agent loop execution completed"
          );

          getStatsDClient().increment(METRICS.PHASE_COMPLETIONS, 1);
          getStatsDClient().distribution(
            METRICS.PHASE_DURATION,
            phaseDurationMs
          );
          getStatsDClient().histogram(METRICS.PHASE_STEPS, stepsCompleted);

          getStatsDClient().increment(METRICS.LOOP_COMPLETIONS, 1);
          getStatsDClient().distribution(
            METRICS.LOOP_DURATION,
            totalDurationMs
          );
        },
      },
    },
  };
