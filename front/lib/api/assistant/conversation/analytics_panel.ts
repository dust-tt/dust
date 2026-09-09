import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";

export async function promoteAnalyticsPanelConversation(
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  if (conversation.visibility !== "test") {
    return;
  }

  const openingOrigin = await conversation.openingUserMessageOrigin(auth);
  if (openingOrigin !== "analytics_panel") {
    return;
  }

  await conversation.updateVisibilityToUnlisted(auth);
}
