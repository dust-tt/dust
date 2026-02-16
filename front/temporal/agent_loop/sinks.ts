import { statsDClient } from "@app/logger/statsDClient";
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
          statsDClient.increment(METRICS.PHASE_STARTS, 1);
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

          statsDClient.increment(METRICS.STEP_STARTS, 1, tags);
          statsDClient.increment(METRICS.STEP_COMPLETIONS, 1, tags);
          statsDClient.distribution(
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

          statsDClient.increment(METRICS.PHASE_COMPLETIONS, 1);
          statsDClient.distribution(METRICS.PHASE_DURATION, phaseDurationMs);
          statsDClient.histogram(METRICS.PHASE_STEPS, stepsCompleted);

          statsDClient.increment(METRICS.LOOP_COMPLETIONS, 1);
          statsDClient.distribution(METRICS.LOOP_DURATION, totalDurationMs);
        },
      },
    },
  };
