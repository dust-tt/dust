import { listAgenticAncestors } from "@app/lib/api/assistant/conversation/agentic_ancestors";
import { MAX_CONVERSATION_DEPTH } from "@app/lib/api/assistant/conversation/constants";
import {
  NOTHING_TO_RESUME_ERROR_CODES,
  retryBlockedActions,
} from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import type { DustErrorCode } from "@app/lib/error";
import { DustError } from "@app/lib/error";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

// Outcomes that mean "this ancestor has nothing to resume", not "resuming failed": a handover
// caller was never blocked, a sibling validation already relaunched it, or it reached a terminal
// state. Higher ancestors may still be parked, so the walk continues.
const NON_BLOCKING_RETRY_ERROR_CODES: DustErrorCode[] = [
  "agent_loop_already_running",
  ...NOTHING_TO_RESUME_ERROR_CODES,
];

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

  const ancestors = await listAgenticAncestors(auth, conversation, {
    agentMessageId,
    maxAncestors: MAX_CONVERSATION_DEPTH,
  });

  for (const ancestor of ancestors) {
    const {
      agentMessageId: parentAgentMessageId,
      conversation: parentConversation,
    } = ancestor;

    const retryRes = await retryBlockedActions(
      auth,
      parentConversation.toJSON(),
      {
        messageId: parentAgentMessageId,
        waitForCompletion: true,
      }
    );

    if (retryRes.isErr()) {
      const logBlob = {
        workspaceId: owner.sId,
        parentConversationId: parentConversation.sId,
        parentAgentMessageId,
        err: retryRes.error,
      };

      if (
        retryRes.error instanceof DustError &&
        NON_BLOCKING_RETRY_ERROR_CODES.includes(retryRes.error.code)
      ) {
        logger.info(logBlob, "Parent conversation had nothing to resume");
      } else {
        logger.error(
          logBlob,
          "Failed to retry blocked actions on parent conversation"
        );
      }
    }
  }
}
