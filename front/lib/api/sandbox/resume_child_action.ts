import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { launchSandboxChildToolWorkflow } from "@app/temporal/agent_loop/client";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";

export async function resumeSandboxChildAction(
  auth: Authenticator,
  {
    action,
    conversationId,
    conversationTitle,
    agentMessageId,
    agentMessageVersion,
    branchId,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  }: {
    action: AgentMCPActionResource;
    conversationId: string;
    conversationTitle: string | null;
    agentMessageId: string;
    agentMessageVersion: number;
    branchId: string | null;
    userMessageId: string;
    userMessageVersion: number;
    userMessageOrigin: UserMessageOrigin;
  }
): Promise<void> {
  await launchSandboxChildToolWorkflow(auth, {
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
      initialStartTime: Date.now(),
    },
    action,
    step: action.stepContent.step,
    waitForCompletion: true,
  });

  logger.info(
    {
      actionId: action.id,
      conversationId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    "Sandbox child action resumed"
  );
}
