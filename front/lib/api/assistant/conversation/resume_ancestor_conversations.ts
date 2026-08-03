import { MAX_CONVERSATION_DEPTH } from "@app/lib/api/assistant/conversation/constants";
import {
  isNonBlockingRetryError,
  retryBlockedActions,
} from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";

/**
 * Walk up the agentic-parent chain from a freshly resumed agent message and
 * relaunch every parentAgentMessage agent message that is still blocked waiting on its
 * child to complete (run_agent scenario).
 *
 * Best-effort by design: callers reach this after the user's decision is already committed (status
 * flipped, audit emitted, child relaunched), so a failed wake-up must be logged, never reported as
 * a failed approval.
 */
export async function resumeAncestorConversations(
  auth: Authenticator,
  conversation: ConversationResource,
  { agentMessageId }: { agentMessageId: string }
): Promise<void> {
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
      const logBlob = {
        workspaceId: owner.sId,
        parentConversationId: parentConversation.sId,
        parentAgentMessageId: parentAgentMessage.sId,
        err: retryRes.error,
      };

      if (isNonBlockingRetryError(retryRes.error)) {
        logger.info(logBlob, "Parent conversation had nothing to resume");
      } else {
        logger.error(
          logBlob,
          "Failed to retry blocked actions on parent conversation"
        );
      }
    }

    cursor = {
      conversation: parentConversation,
      agentMessageId: parentAgentMessage.sId,
    };
  }
}

/**
 * Retry blocked actions, then wake the callers — as every other resolution surface does.
 * Relaunching a sub-agent's loop alone leaves its caller parked forever.
 *
 * Lives here, not in `retryBlockedActions`: the walk calls that and must not re-enter itself.
 */
export async function retryBlockedActionsAndResumeAncestors(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<Result<void, Error | DustError>> {
  const retryRes = await retryBlockedActions(auth, conversation.toJSON(), {
    messageId,
  });
  if (retryRes.isErr()) {
    return retryRes;
  }

  await resumeAncestorConversations(auth, conversation, {
    agentMessageId: messageId,
  });

  return retryRes;
}
