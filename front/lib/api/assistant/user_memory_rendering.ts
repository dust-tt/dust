import { readConversationMemoryFile } from "@app/lib/api/user_memory";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";

// User-specific, so it goes after the leading skills messages and is named "user": the cache
// breakpoint on the shared skills message must not cover it.
export async function renderUserMemoryUserMessage(
  auth: Authenticator,
  { conversation }: { conversation: ConversationWithoutContentType }
): Promise<UserMessageTypeModel | null> {
  const memoryResult = await readConversationMemoryFile(auth, conversation);
  if (memoryResult.isErr()) {
    logger.error(
      { err: memoryResult.error, conversationId: conversation.sId },
      "Failed to read the conversation memory file"
    );
    return null;
  }

  const memory = memoryResult.value;
  if (memory === null || memory.length === 0) {
    return null;
  }

  return {
    role: "user",
    name: "user",
    content: [
      {
        type: "text",
        text:
          `<dust_system>\n` +
          `The memory of the user, ${auth.getNonNullableUser().fullName()}:\n\n` +
          `<user_memory>\n${memory}\n</user_memory>\n` +
          `</dust_system>`,
      },
    ],
  };
}
