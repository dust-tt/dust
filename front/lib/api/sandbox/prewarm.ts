import { ensureConversationSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Start bringing the conversation's Computer up without waiting for it. Meant to be called
 * fire-and-forget when a following Computer command is likely, so its cold start overlaps the
 * model turn instead of the command. Failures are logged and never surface: the next real command
 * runs the same readiness path and reports its own error.
 */
export function prewarmConversationSandbox(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): void {
  const logContext = {
    conversationId: conversation.sId,
    workspaceId: auth.getNonNullableWorkspace().sId,
  };
  void ensureConversationSandboxReady(auth, conversation)
    .then((result) => {
      if (result.isErr()) {
        logger.warn(
          { ...logContext, err: result.error },
          "Conversation sandbox pre-warm failed"
        );
      }
    })
    .catch((err) => {
      logger.error(
        { ...logContext, err },
        "Conversation sandbox pre-warm threw"
      );
    });
}
