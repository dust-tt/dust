import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";

/**
 * @cc [owner:achilleburah,label:product] promotes-only-hidden-analytics-panel-conversations
 * Makes an Analytics-panel conversation visible in the user's conversation history by moving it
 * from `test` to `unlisted` visibility. It is a no-op unless the conversation is both
 * `test`-visibility and marked with `analyticsPanel` metadata, and it is idempotent.
 */
export async function promoteAnalyticsPanelConversation(
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  if (
    conversation.visibility !== "test" ||
    conversation.metadata?.analyticsPanel !== true
  ) {
    return;
  }

  await conversation.updateVisibilityToUnlisted(auth);
}
