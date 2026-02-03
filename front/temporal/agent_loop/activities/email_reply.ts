import {
  sendEmailReplyOnCompletion as sendEmailReplyOnCompletionImpl,
  sendEmailReplyOnError as sendEmailReplyOnErrorImpl,
} from "@app/lib/api/assistant/email_reply";
import type { AuthenticatorType } from "@app/lib/auth";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";

/**
 * Activity wrapper: Send an email reply after agent message completion.
 * This is a fire-and-forget operation: failures are logged but don't fail the workflow.
 */
export async function sendEmailReplyOnCompletion(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  // Only process email-originated messages.
  if (agentLoopArgs.userMessageOrigin !== "email") {
    return;
  }

  // Get the completed agent message data.
  const dataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (dataRes.isErr()) {
    return;
  }

  const { auth, agentMessage, conversation } = dataRes.value;

  await sendEmailReplyOnCompletionImpl({
    auth,
    workspaceId: authType.workspaceId,
    agentMessageId: agentLoopArgs.agentMessageId,
    agentMessageContent: agentMessage.content,
    conversationId: conversation.sId,
  });
}

/**
 * Activity wrapper: Send an error email on agent error/cancellation.
 * This is a fire-and-forget operation: failures are logged but don't fail the workflow.
 */
export async function sendEmailReplyOnError(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  errorMessage: string
): Promise<void> {
  if (agentLoopArgs.userMessageOrigin !== "email") {
    return;
  }

  await sendEmailReplyOnErrorImpl({
    workspaceId: authType.workspaceId,
    agentMessageId: agentLoopArgs.agentMessageId,
    errorMessage,
  });
}
