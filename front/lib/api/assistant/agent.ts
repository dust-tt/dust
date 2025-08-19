import assert from "assert";

import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
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
  RunAgentExecutionData,
} from "@app/types/assistant/agent_run";

// 2 minutes timeout before switching from sync to async execution.
const SYNC_TO_ASYNC_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Helper to launch async workflow from sync data.
 */
async function launchAsyncWorkflowFromSyncData(
  authType: AuthenticatorType,
  runAgentExecutionData: RunAgentExecutionData,
  { startStep }: { startStep: number }
): Promise<void> {
  const { agentMessage, conversation, userMessage } = runAgentExecutionData;

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
  });
}

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// but it now handles updating it based on the execution results.
async function runAgentSynchronousWithStreaming(
  authType: AuthenticatorType,
  runAgentExecutionData: RunAgentExecutionData,
  {
    startStep,
    withTimeout = true,
  }: { startStep: number; withTimeout?: boolean }
): Promise<void> {
  const runAgentArgs: RunAgentArgs = {
    sync: true,
    inMemoryData: runAgentExecutionData,
    ...(withTimeout && { syncToAsyncTimeoutMs: SYNC_TO_ASYNC_TIMEOUT_MS }),
  };

  const titlePromise = ensureConversationTitle(authType, runAgentArgs);

  // NOTE: This is an exception to our usual Result<> pattern. Since executeAgentLoop is shared
  // between Temporal workflows (which have serialization constraints) and direct execution,
  // we use throwing as the common mechanism that works in both contexts. The SyncTimeoutError
  // is only thrown in sync mode and never reaches Temporal workflows.
  try {
    await wakeLock(
      async () => {
        await executeAgentLoop(
          authType,
          runAgentArgs,
          {
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

      await launchAsyncWorkflowFromSyncData(authType, runAgentExecutionData, {
        startStep: error.currentStep,
      });

      logger.info(
        {
          agentMessageId: runAgentExecutionData.agentMessage.sId,
          conversationId: runAgentExecutionData.conversation.sId,
          currentStep: error.currentStep,
          elapsedMs: error.elapsedMs,
          workspaceId: authType.workspaceId,
        },
        "Sync execution timeout reached - switching to async"
      );

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

  if (runAgentArgs.sync && executionMode !== "async") {
    await runAgentSynchronousWithStreaming(
      authType,
      runAgentArgs.inMemoryData,
      { startStep, withTimeout: executionMode !== "sync" }
    );
  } else if (runAgentArgs.sync) {
    await launchAsyncWorkflowFromSyncData(authType, runAgentArgs.inMemoryData, {
      startStep,
    });
  } else {
    await launchAgentLoopWorkflow({
      authType,
      runAsynchronousAgentArgs: runAgentArgs.idArgs,
      startStep,
    });
  }
}
