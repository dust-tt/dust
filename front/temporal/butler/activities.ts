import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";

export async function analyzeConversationActivity({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  logger.info(
    { workspaceId: authType.workspaceId, conversationId, messageId },
    "Butler: analyzing conversation (stub)"
  );
}
