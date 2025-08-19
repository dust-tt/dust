import assert from "assert";

import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { wakeLock } from "@app/lib/wake_lock";
import {
  logAgentLoopPhaseCompletionActivity,
  logAgentLoopPhaseStartActivity,
  logAgentLoopPhaseTimeout,
  logAgentLoopStart,
  logAgentLoopStepCompletionActivity,
} from "@app/temporal/agent_loop/activities/instrumentation";
import { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import {
  executeAgentLoop,
  SyncTimeoutError,
} from "@app/temporal/agent_loop/lib/agent_loop_executor";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  ExecutionMode,
  RunAgentArgs,
} from "@app/types/assistant/agent_run";

// 2 minutes timeout before switching from sync to async execution.
const SYNC_TO_ASYNC_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Helper to launch async workflow from sync data.
 */
async function launchAsyncWorkflowFromSyncData(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs & { sync: true },
  { startStep }: { startStep: number }
): Promise<void> {
  const { agentMessage, conversation, userMessage } = runAgentArgs.inMemoryData;

  await launchAgentLoopWorkflow({
    authType,
    runAsynchronousAgentArgs: {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
    },
    startStep,
    initialStartTime: runAgentArgs.initialStartTime,
  });
}

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// but it now handles updating it based on the execution results.
async function runAgentSynchronousWithStreaming(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs & { sync: true },
  {
    startStep,
    withTimeout = true,
  }: { startStep: number; withTimeout?: boolean }
): Promise<void> {
  const runAgentExecutionData = runAgentArgs.inMemoryData;
  const runAgentArgsForExecution: RunAgentArgs = {
    sync: true,
    inMemoryData: runAgentExecutionData,
    initialStartTime: runAgentArgs.initialStartTime,
    ...(withTimeout && { syncToAsyncTimeoutMs: SYNC_TO_ASYNC_TIMEOUT_MS }),
  };

  const titlePromise = ensureConversationTitle(
    authType,
    runAgentArgsForExecution
  );

  // NOTE: This is an exception to our usual Result<> pattern. Since executeAgentLoop is shared
  // between Temporal workflows (which have serialization constraints) and direct execution,
  // we use throwing as the common mechanism that works in both contexts. The SyncTimeoutError
  // is only thrown in sync mode and never reaches Temporal workflows.
  try {
    await wakeLock(
      async () => {
        await executeAgentLoop(
          authType,
          runAgentArgsForExecution,
          {
            logAgentLoopPhaseCompletionActivity,
            logAgentLoopPhaseStartActivity,
            logAgentLoopStepCompletionActivity,
            runModelAndCreateActionsActivity,
            runToolActivity,
          },
          {
            startStep,
          }
        );
      },
      {
        operation: "agent_sync_execution",
        conversationId: runAgentExecutionData.conversation.sId,
        agentMessageId: runAgentExecutionData.agentMessage.sId,
      }
    );
  } catch (error) {
    if (error instanceof SyncTimeoutError) {
      // Ensure title is computed and update in-memory conversation before launching async workflow.
      const generatedTitle = await titlePromise;
      if (generatedTitle) {
        runAgentExecutionData.conversation.title = generatedTitle;
      }

      await launchAsyncWorkflowFromSyncData(authType, runAgentArgs, {
        startStep: error.currentStep,
      });

      logAgentLoopPhaseTimeout({
        authType,
        eventData: {
          agentMessageId: runAgentExecutionData.agentMessage.sId,
          conversationId: runAgentExecutionData.conversation.sId,
          currentStep: error.currentStep,
          executionMode: "sync",
          phaseDurationMs: error.elapsedMs,
          stepsCompleted: error.currentStep - startStep,
        },
      });

      // Don't continue with sync execution after switching to async.
      return;
    }

    // Re-throw other errors.
    throw error;
  }

  await titlePromise;

  assert(authType.workspaceId, "Workspace ID is required");

  // It's fine to start the workflow here because the workflow will sleep for one hour before
  // computing usage.
  await launchUpdateUsageWorkflow({
    workspaceId: authType.workspaceId,
  });
}

/**
 * Higher-level function that serves as single entry point to either synchronous or asynchronous
 * execution based on the RunAgentArgs type.
 */
export async function runAgentLoop(
  auth: Authenticator,
  runAgentArgs: RunAgentArgs,
  {
    executionMode = "auto",
    startStep,
  }: { executionMode?: ExecutionMode; startStep: number }
): Promise<void> {
  const authType = auth.toJSON();

  // Capture initial start time and log total execution start.
  const initialStartTime = Date.now();
  const conversationId = runAgentArgs.sync
    ? runAgentArgs.inMemoryData.conversation.sId
    : runAgentArgs.idArgs.conversationId;
  const agentMessageId = runAgentArgs.sync
    ? runAgentArgs.inMemoryData.agentMessage.sId
    : runAgentArgs.idArgs.agentMessageId;

  logAgentLoopStart({
    conversationId,
    agentMessageId,
    executionMode: runAgentArgs.sync ? "sync" : "async",
    startStep,
  });

  // Thread initial start time through execution
  const runAgentArgsWithTiming = {
    ...runAgentArgs,
    initialStartTime,
  };

  if (runAgentArgsWithTiming.sync && executionMode !== "async") {
    await runAgentSynchronousWithStreaming(authType, runAgentArgsWithTiming, {
      startStep,
      withTimeout: executionMode !== "sync",
    });
  } else if (runAgentArgsWithTiming.sync) {
    await launchAsyncWorkflowFromSyncData(authType, runAgentArgsWithTiming, {
      startStep,
    });
  } else {
    await launchAgentLoopWorkflow({
      authType,
      runAsynchronousAgentArgs: runAgentArgsWithTiming.idArgs,
      startStep,
      initialStartTime: runAgentArgsWithTiming.initialStartTime,
    });
  }
}
