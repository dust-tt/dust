import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function promoteAnalyticsPanelConversation(
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<Result<undefined, string>> {
  if (conversation.visibility !== "test") {
    return new Err("Conversation is not in test visibility");
  }

  const openingOrigin = await conversation.openingUserMessageOrigin(auth);
  if (openingOrigin !== "analytics_panel") {
    return new Err("Conversation was not opened from the analytics panel");
  }

  try {
    await conversation.updateVisibilityToUnlisted(auth);
  } catch (error) {
    logger.error(
      { error: error, conversationId: conversation.sId },
      "Failed to update conversation visibility to unlisted"
    );
    return new Err("Failed to update conversation visibility to unlisted");
  }
  return new Ok(undefined);
}
