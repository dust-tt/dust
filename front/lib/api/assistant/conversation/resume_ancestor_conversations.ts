import { MAX_CONVERSATION_DEPTH } from "@app/lib/api/assistant/conversation/constants";
import { retryBlockedActions } from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Walk up the agentic-parent chain from a freshly resumed agent message and
 * relaunch every parentAgentMessage agent message that is still blocked waiting on its
 * child to complete (run_agent scenario).
 */
export async function resumeAncestorConversations(
  auth: Authenticator,
  conversation: ConversationResource,
  { agentMessageId }: { agentMessageId: string }
): Promise<Result<void, DustError<"internal_error">>> {
  const owner = auth.getNonNullableWorkspace();

  let cursor: {
    conversation: ConversationResource;
    agentMessageId: string;
  } = { conversation, agentMessageId };

  for (let depth = 0; depth < MAX_CONVERSATION_DEPTH; depth++) {
    const parentAgentMessage = await cursor.conversation.findAgenticParent(
      auth,
      {
        agentMessageId: cursor.agentMessageId,
      }
    );
    if (!parentAgentMessage) {
      break;
    }

    const [parentConversation] = await ConversationResource.fetchByModelIds(
      auth,
      [parentAgentMessage.conversationId],
      { loadSpaces: true }
    );
    if (!parentConversation) {
      break;
    }

    const retryRes = await retryBlockedActions(
      auth,
      parentConversation.toJSON(),
      {
        messageId: parentAgentMessage.sId,
        waitForCompletion: true,
      }
    );

    if (retryRes.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          parentConversationId: parentConversation.sId,
          parentAgentMessageId: parentAgentMessage.sId,
          err: retryRes.error,
        },
        "Failed to retry blocked actions on parent conversation"
      );
      return new Err(
        new DustError("internal_error", "Failed to resume parent conversation")
      );
    }

    cursor = {
      conversation: parentConversation,
      agentMessageId: parentAgentMessage.sId,
    };
  }

  return new Ok(undefined);
}
