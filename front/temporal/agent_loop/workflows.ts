import {
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
  RUN_AGENT_CALL_TOOL_TIMEOUT_MS,
} from "@app/lib/actions/constants";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as compactionActivities from "@app/temporal/agent_loop/activities/compaction";
import type * as creditCheckActivities from "@app/temporal/agent_loop/activities/credit_check";
import type * as ensureTitleActivities from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import type * as finalizeActivities from "@app/temporal/agent_loop/activities/finalize";
import type * as finalizeSandboxChildToolActivities from "@app/temporal/agent_loop/activities/finalize_sandbox_child_tool";
import type * as publishDeferredEventsActivities from "@app/temporal/agent_loop/activities/publish_deferred_events";
import type * as runModelAndCreateWrapperActivities from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type * as runToolActivities from "@app/temporal/agent_loop/activities/run_tool";
import {
  MODEL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
} from "@app/temporal/agent_loop/config";
import type { ToolExecutionResult } from "@app/temporal/agent_loop/lib/deferred_events";
import { waitForAllPromises } from "@app/temporal/agent_loop/lib/wait_for_all_promises";
import {
  getWorkflowFailureDetails,
  isSwallowableWorkflowFailure,
  isTerminalRunToolTimeout,
} from "@app/temporal/agent_loop/lib/workflow_failures";
import { makeAgentLoopConversationTitleWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import {
  cancelAgentLoopSignal,
  gracefullyStopAgentLoopSignal,
  interruptAgentLoopSignal,
} from "@app/temporal/agent_loop/signals";
import type { AgentLoopInstrumentationSinks } from "@app/temporal/agent_loop/sinks";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import type {
  AgentLoopArgs,
  AgentLoopArgsWithTiming,
} from "@app/types/assistant/agent_run";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type {
  ChildWorkflowHandle,
  WorkflowInterceptorsFactory,
} from "@temporalio/workflow";
import {
  ActivityCancellationType,
  CancellationScope,
  deprecatePatch,
  log,
  patched,
  proxyActivities,
  proxySinks,
  setHandler,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";

const toolActivityStartToCloseTimeoutMs =
  Math.max(RUN_AGENT_CALL_TOOL_TIMEOUT_MS, DEFAULT_MCP_REQUEST_TIMEOUT_MS) +
  60 * 1000;

import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryInternalsInterceptor,
  OpenTelemetryOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/workflow";

// Export an interceptors variable to add OpenTelemetry interceptors to the workflow.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

const { runModelAndCreateActionsActivity } = proxyActivities<
  typeof runModelAndCreateWrapperActivities
>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: MODEL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  retry: {
    // Attempts past RUN_MODEL_MAX_RETRIES only serve non-model failures (worker-shutdown
    // interruptions, timeouts, internal errors): real model errors self-limit in run_model
    // (see shouldSurfaceModelError).
    maximumAttempts: RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
  },
});

const { runToolActivity } = proxyActivities<typeof runToolActivities>({
  // Activity timeout keeps a short buffer above the tool timeout to detect worker restarts promptly.
  startToCloseTimeout: toolActivityStartToCloseTimeoutMs,
  heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  retry: {
    // Do not retry tool activities. Those are not idempotent.
    maximumAttempts: 1,
  },
});

const { runToolActivity: runRetryableToolActivity } = proxyActivities<
  typeof runToolActivities
>({
  startToCloseTimeout: toolActivityStartToCloseTimeoutMs,
  heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  retry: {
    maximumAttempts: RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
  },
});

const { runToolActivity: runToolActivityWithExplicitCancellation } =
  proxyActivities<typeof runToolActivities>({
    startToCloseTimeout: toolActivityStartToCloseTimeoutMs,
    heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    retry: {
      maximumAttempts: 1,
    },
  });

const { runToolActivity: runRetryableToolActivityWithExplicitCancellation } =
  proxyActivities<typeof runToolActivities>({
    startToCloseTimeout: toolActivityStartToCloseTimeoutMs,
    heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    retry: {
      maximumAttempts: RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
    },
  });

const { publishDeferredEventsActivity } = proxyActivities<
  typeof publishDeferredEventsActivities
>({
  startToCloseTimeout: "2 minutes",
});

const { checkCreditsActivity } = proxyActivities<typeof creditCheckActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

const { metrics } = proxySinks<AgentLoopInstrumentationSinks>();

const { ensureConversationTitleActivity } = proxyActivities<
  typeof ensureTitleActivities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    // Retry twice and fail given non criticality. The activity will fail if the conversation gets
    // deleted before it gets to title generation.
    maximumAttempts: 3,
  },
});

const { compactionActivity } = proxyActivities<typeof compactionActivities>({
  startToCloseTimeout: "20 minutes",
  retry: {
    // Do not retry compaction, the message is marked as failed, not idempotent
    maximumAttempts: 1,
  },
});

const { compactionCleanupActivity } = proxyActivities<
  typeof compactionActivities
>({
  startToCloseTimeout: "1 minute",
});

const {
  finalizeSuccessfulAgentLoopActivity,
  finalizeGracefullyStoppedAgentLoopActivity,
  finalizeCreditStoppedAgentLoopActivity,
  finalizeCancelledAgentLoopActivity,
  finalizeInterruptedAgentLoopActivity,
  finalizeErroredAgentLoopActivity,
} = proxyActivities<typeof finalizeActivities>({
  startToCloseTimeout: "1 minute",
});

const { finalizeErroredSandboxChildToolActivity } = proxyActivities<
  typeof finalizeSandboxChildToolActivities
>({
  startToCloseTimeout: "1 minute",
});

export async function agentLoopConversationTitleWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}) {
  await ensureConversationTitleActivity(authType, agentLoopArgs);
}

export async function compactionWorkflow({
  authType,
  conversationId,
  compactionMessageId,
  compactionMessageVersion,
  model,
  sourceConversation,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  compactionMessageId: string;
  compactionMessageVersion: number;
  model: SupportedModel;
  sourceConversation?: CompactionSourceConversation;
}) {
  try {
    await compactionActivity(authType, {
      conversationId,
      compactionMessageId,
      compactionMessageVersion,
      model,
      sourceConversation,
    });
  } catch (_error) {
    // If the compactionActivity has failed, it may be a timeout and the
    // compaction message remained stuck in a "created" state.
    await compactionCleanupActivity(authType, {
      conversationId,
      compactionMessageId,
      compactionMessageVersion,
    });
  }
}

export async function agentLoopWorkflow({
  authType,
  initialStartTime,
  agentLoopArgs,
  startStep,
}: {
  authType: AuthenticatorType;
  initialStartTime: number;
  agentLoopArgs: AgentLoopArgs;
  startStep: number;
}) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  // Allow cancellation of in-flight activities via signal-triggered scope cancellation.
  let cancelRequested = false;
  const executionScope = new CancellationScope();

  setHandler(cancelAgentLoopSignal, () => {
    cancelRequested = true;
    executionScope.cancel();
  });

  // Interrupt: same immediate kill as cancel, but pending queued messages will be processed
  // afterwards (unlike a full cancel which abandons the queue).
  let interruptRequested = false;

  setHandler(interruptAgentLoopSignal, () => {
    interruptRequested = true;
    executionScope.cancel();
  });

  // Graceful stop: let the current step finish, then exit the loop at the next step boundary.
  // Unlike cancellation, in-flight activities are not killed.
  let gracefulStopRequested = false;

  setHandler(gracefullyStopAgentLoopSignal, () => {
    gracefulStopRequested = true;
  });

  // Credit stop: the per-step gate found the workspace pool exhausted.
  let creditStopRequested = false;

  const runIds: string[] = [];

  try {
    const { agentMessageId, conversationId } = agentLoopArgs;

    await executionScope.run(async () => {
      const syncStartTime = Date.now();
      let currentStep = startStep;
      // Set when the previous step returned nothing at all: the next step runs with tool use
      // disabled to force a final answer.
      let forceDisableToolUse = false;
      let childWorkflowHandle: ChildWorkflowHandle<
        typeof agentLoopConversationTitleWorkflow
      > | null = null;

      metrics.logPhaseStart(
        authType.workspaceId,
        agentMessageId,
        conversationId,
        startStep
      );

      for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
        currentStep = i;

        const stepStartTime = Date.now();

        const { runId, shouldContinue, retryWithoutTools } =
          await executeStepIteration({
            authType,
            agentLoopArgs: {
              ...agentLoopArgs,
              initialStartTime,
            },
            currentStep,
            runIds,
            startStep,
            forceDisableToolUse,
          });

        forceDisableToolUse = retryWithoutTools ?? false;

        // Update state with results.
        if (runId) {
          runIds.push(runId);
        }

        metrics.logStepCompletion(
          agentMessageId,
          conversationId,
          currentStep,
          stepStartTime
        );

        // After the first step completes, launch title generation in the background. We wait until
        // the first step so the agent has at least one response in the database, otherwise the
        // title model would only see the user's question without context.
        if (i === startStep && !agentLoopArgs.conversationTitle) {
          try {
            childWorkflowHandle = await startChild(
              agentLoopConversationTitleWorkflow,
              {
                workflowId: makeAgentLoopConversationTitleWorkflowId(
                  authType,
                  agentLoopArgs
                ),
                searchAttributes: parentSearchAttributes,
                args: [{ authType, agentLoopArgs }],
                memo,
              }
            );
          } catch (err) {
            if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
              throw err;
            }
          }
        }

        if (!shouldContinue || gracefulStopRequested) {
          break;
        }

        const creditCheckResult = await checkCreditsActivity(authType, {
          agentLoopArgs: {
            ...agentLoopArgs,
            initialStartTime,
          },
        });
        if (creditCheckResult.shouldStop) {
          creditStopRequested = true;
          break;
        }
      }

      const stepsCompleted = currentStep - startStep;

      metrics.logPhaseCompletion(
        authType.workspaceId,
        agentMessageId,
        conversationId,
        initialStartTime,
        stepsCompleted,
        syncStartTime
      );

      // Attach this execution's runIds so tracking workflows process only
      // these runs (not all accumulated runs on the agent message).
      // Pass this execution's runIds and startStep to finalize so tracking
      // workflows only process this execution's runs and actions.
      const argsWithRunIds = {
        ...agentLoopArgs,
        dustRunIds: runIds,
        startStep,
      };

      await CancellationScope.nonCancellable(async () => {
        if (gracefulStopRequested) {
          await finalizeGracefullyStoppedAgentLoopActivity(
            authType,
            argsWithRunIds
          );
        } else if (creditStopRequested) {
          await finalizeCreditStoppedAgentLoopActivity(
            authType,
            argsWithRunIds
          );
        } else {
          await finalizeSuccessfulAgentLoopActivity(authType, argsWithRunIds);
        }
      });

      if (childWorkflowHandle) {
        await childWorkflowHandle.result();
      }
    });
  } catch (err) {
    const workflowError = err instanceof Error ? err : new Error(String(err));
    // The message is finalized as errored below either way: swallowing only removes the FAILED
    // workflow status (see isSwallowableWorkflowFailure). Swallowing a tool timeout turns the
    // terminal command from fail into complete, so it is gated on a patch marker: replays of
    // histories that predate the patch keep the legacy throw. The patch is only consulted (and
    // its marker only recorded) when the error actually is a terminal tool timeout.
    const shouldSwallowWorkflowFailure = isSwallowableWorkflowFailure(err, {
      swallowToolTimeouts:
        isTerminalRunToolTimeout(err) &&
        patched("swallow-terminal-tool-timeouts"),
    });

    // Notify error in a non-cancellable scope to ensure it runs even if the workflow is canceled.
    // Pass this execution's runIds and startStep to finalize so tracking
    // workflows only process this execution's runs and actions.
    const argsWithRunIds = {
      ...agentLoopArgs,
      dustRunIds: runIds,
      startStep,
    };

    if (cancelRequested || interruptRequested) {
      await CancellationScope.nonCancellable(async () => {
        // Interrupt takes precedence over cancel: the user chose to redirect rather than abort,
        // so pending queued messages should still be promoted.
        if (interruptRequested) {
          await finalizeInterruptedAgentLoopActivity(authType, argsWithRunIds);
        } else {
          await finalizeCancelledAgentLoopActivity(authType, argsWithRunIds);
        }
      });
      return;
    }

    await CancellationScope.nonCancellable(async () =>
      finalizeErroredAgentLoopActivity(authType, argsWithRunIds, {
        // Error objects don't survive JSON serialization across the workflow→activity boundary
        // (Error.message is not enumerable), so we extract the relevant fields into a plain object
        // before passing to the activity.
        message: workflowError.message,
        name: workflowError.name,
        swallowed: shouldSwallowWorkflowFailure,
        ...getWorkflowFailureDetails(err),
      })
    );

    if (shouldSwallowWorkflowFailure) {
      return;
    }

    throw err;
  }
}

async function executeStepIteration({
  authType,
  currentStep,
  agentLoopArgs,
  runIds,
  startStep,
  forceDisableToolUse,
}: {
  authType: AuthenticatorType;
  currentStep: number;
  agentLoopArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  startStep: number;
  forceDisableToolUse: boolean;
}): Promise<{
  runId: string | null;
  shouldContinue: boolean;
  retryWithoutTools?: boolean;
}> {
  deprecatePatch("wait-for-model-activity-before-finalization");

  const result = await runModelAndCreateActionsActivity({
    authType,
    checkForResume: currentStep === startStep, // Only run resume the first time.
    runAgentArgs: agentLoopArgs,
    runIds,
    step: currentStep,
    forceDisableToolUse,
  });

  if (!result) {
    // Error occurred — no runId to capture.
    return {
      runId: null,
      shouldContinue: false,
    };
  }

  const { runId, actionBlobs, retryWithoutTools = false } = result;

  // Generation completed or the loop unpaused and no new tools were generated.
  if (actionBlobs.length === 0) {
    return {
      runId,
      // If runId is null that means we unpaused the loop with no new tools (eg: they were all
      // denied) and no LLM call, so we need to continue as the agent loop is not finished.
      // retryWithoutTools means the model returned nothing: run one more step with tool use
      // disabled to force a final answer.
      shouldContinue: runId === null || retryWithoutTools,
      retryWithoutTools,
    };
  }

  // If at least one action needs approval, we break out of the loop and will resume once all
  // actions have been approved.
  const needsApproval = actionBlobs.some((a) => a.needsApproval);
  if (needsApproval) {
    return {
      runId,
      shouldContinue: false,
    };
  }

  // Execute tools and collect any deferred events.
  deprecatePatch("wait-for-all-tool-activities-before-finalization");
  const toolActivityPromises = actionBlobs.map(({ actionId, retryPolicy }) =>
    retryPolicy === "no_retry"
      ? runToolActivityWithExplicitCancellation(authType, {
          actionId,
          runAgentArgs: agentLoopArgs,
          step: currentStep,
          runIds: [...(runIds ?? []), ...(runId ? [runId] : [])],
        })
      : runRetryableToolActivityWithExplicitCancellation(authType, {
          actionId,
          runAgentArgs: agentLoopArgs,
          step: currentStep,
          runIds: [...(runIds ?? []), ...(runId ? [runId] : [])],
        })
  );
  const toolResults: ToolExecutionResult[] = await waitForAllPromises(
    toolActivityPromises,
    {
      // A swallowable infrastructure timeout must not mask a sibling tool's real failure.
      preferRejection: (reason) => !isTerminalRunToolTimeout(reason),
    }
  );

  // Collect all deferred events from tool executions.
  const allDeferredEvents = toolResults.flatMap(
    (result) => result.deferredEvents
  );

  // If there are deferred events, publish them after all tools have completed.
  if (allDeferredEvents.length > 0) {
    const shouldPauseWorkflow =
      await publishDeferredEventsActivity(allDeferredEvents);

    if (shouldPauseWorkflow) {
      // Break the loop - workflow will be restarted externally once required action is completed.
      return {
        runId,
        shouldContinue: false,
      };
    }
  }

  return {
    runId,
    shouldContinue: !toolResults.some((result) => result.shouldPauseAgentLoop),
  };
}

export async function runSandboxChildToolWorkflow({
  authType,
  agentLoopArgs,
  actionModelId,
  retryPolicy,
  step,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgsWithTiming;
  actionModelId: number;
  // Optional so workflows started before this argument was added replay with the previous
  // single-attempt behavior.
  retryPolicy?: MCPToolRetryPolicyType;
  step: number;
}) {
  const activityArgs = {
    actionId: actionModelId,
    runAgentArgs: agentLoopArgs,
    step,
  };
  let toolResult: ToolExecutionResult;
  if (retryPolicy !== undefined && patched("sandbox-child-tool-retry-policy")) {
    try {
      switch (retryPolicy) {
        case "retry_on_interrupt":
          toolResult = await runRetryableToolActivity(authType, activityArgs);
          break;
        case "no_retry":
          toolResult = await runToolActivity(authType, activityArgs);
          break;
        default:
          assertNever(retryPolicy);
      }
    } catch (error) {
      await CancellationScope.nonCancellable(() =>
        finalizeErroredSandboxChildToolActivity(authType, {
          actionModelId,
        })
      );

      // Preserve the recorded failed outcome when replaying histories created before terminal
      // activity failures became action results.
      if (patched("sandbox-child-tool-terminal-failure-as-result")) {
        log.error("Sandbox child tool activity failed.", {
          actionModelId,
          error,
        });
        return;
      }

      throw error;
    }
  } else {
    toolResult = await runToolActivity(authType, activityArgs);
  }

  const { deferredEvents } = toolResult;

  if (deferredEvents.length > 0) {
    await publishDeferredEventsActivity(deferredEvents);
  }
}
