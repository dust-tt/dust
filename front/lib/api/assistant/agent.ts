import assert from "assert";

import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { AuthenticatorType } from "@app/lib/auth";
import { wakeLock } from "@app/lib/wake_lock";
import { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentLoopActivities } from "@app/temporal/agent_loop/lib/activity_interface";
import { executeAgentLoop } from "@app/temporal/agent_loop/lib/agent_loop_executor";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  RunAgentArgs,
  RunAgentSynchronousArgs,
} from "@app/types/assistant/agent_run";

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// but it now handles updating it based on the execution results.
async function runAgentSynchronousWithStreaming(
  authType: AuthenticatorType,
  runAgentSynchronousArgs: RunAgentSynchronousArgs
): Promise<void> {
  const runAgentArgs: RunAgentArgs = {
    sync: true,
    inMemoryData: runAgentSynchronousArgs,
  };

  const titlePromise = ensureConversationTitle(authType, runAgentArgs);

  // Create direct activities for non-Temporal execution.
  const directActivities: AgentLoopActivities = {
    runModelActivity: (args) => runModelActivity(args),
    runToolActivity: (authType, args) => runToolActivity(authType, args),
  };

  await wakeLock(async () => {
    await executeAgentLoop(authType, runAgentArgs, directActivities);
  });

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
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs,
  { forceAsynchronousLoop = false }: { forceAsynchronousLoop?: boolean } = {}
): Promise<void> {
  if (runAgentArgs.sync && !forceAsynchronousLoop) {
    await runAgentSynchronousWithStreaming(authType, runAgentArgs.inMemoryData);
  } else if (runAgentArgs.sync) {
    const { agentMessage, conversation, userMessage } =
      runAgentArgs.inMemoryData;

    await launchAgentLoopWorkflow({
      authType,
      runAsynchronousAgentArgs: {
        agentMessageId: agentMessage.sId,
        agentMessageVersion: agentMessage.version,
        conversationId: conversation.sId,
        conversationTitle: conversation.title,
        userMessageId: userMessage.sId,
      },
    });
  } else {
    await launchAgentLoopWorkflow({
      authType,
      runAsynchronousAgentArgs: runAgentArgs.idArgs,
    });
  }
}
