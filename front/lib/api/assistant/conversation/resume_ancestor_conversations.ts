import { retryBlockedActions } from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { MAX_CONVERSATION_DEPTH } from "@app/pages/api/v1/w/[wId]/assistant/conversations";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Walk up the agentic-parent chain from a freshly resumed agent message and
 * relaunch every ancestor agent message that is still blocked waiting on its
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
    const parent = await cursor.conversation.findAgenticParent(auth, {
      agentMessageId: cursor.agentMessageId,
    });
    if (!parent) {
      break;
    }

    const retryRes = await retryBlockedActions(
      auth,
      parent.conversation.toJSON(),
      {
        messageId: parent.agentMessageId,
        waitForCompletion: true,
      }
    );

    if (retryRes.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          parentConversationId: parent.conversation.sId,
          parentAgentMessageId: parent.agentMessageId,
          err: retryRes.error,
        },
        "Failed to retry blocked actions on parent conversation"
      );
      return new Err(
        new DustError("internal_error", "Failed to resume parent conversation")
      );
    }

    cursor = parent;
  }

  return new Ok(undefined);
}
