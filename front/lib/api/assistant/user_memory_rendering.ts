import { readConversationMemoryFile } from "@app/lib/api/user_memory";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";

// User-specific, so it goes after the leading skills messages and is named "user": the cache
// breakpoint on the shared skills message must not cover it.
/**
 * @cc [owner:aubin-tchoi,label:product;security] redacted-in-multi-user-conversations
 * When the conversation has more than one participant, the returned message MUST NOT contain the
 * memory: it is replaced by a placeholder at the same position, saying the memory was redacted
 * for the other users and that earlier answers may have relied on it.
 */
export async function renderUserMemoryUserMessage(
  auth: Authenticator,
  { conversation }: { conversation: ConversationWithoutContentType }
): Promise<UserMessageTypeModel | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

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

  const participantCount = await ConversationResource.countParticipants(auth, {
    conversation,
  });
  if (participantCount > 1) {
    return {
      role: "user",
      name: "user",
      content: [
        {
          type: "text",
          text:
            `<dust_system>\n` +
            `The user's memory was loaded here but has been redacted: other users take part in ` +
            `this conversation and it must not be disclosed to them. Answers given earlier in ` +
            `this conversation may have taken it into account. Do not disclose details that ` +
            `came from it.\n` +
            `</dust_system>`,
        },
      ],
    };
  }

  return {
    role: "user",
    name: "user",
    content: [
      {
        type: "text",
        text:
          `<dust_system>\n` +
          `The memory of the user, ${user.fullName()}:\n\n` +
          `<user_memory>\n${memory}\n</user_memory>\n` +
          `</dust_system>`,
      },
    ],
  };
}
