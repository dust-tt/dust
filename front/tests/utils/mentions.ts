import {
  createUserMentions,
  resolveUserMentions,
} from "@app/lib/api/assistant/conversation/mentions";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentMessageTypeWithoutMentions,
  ConversationWithoutContentType,
  UserMessageTypeWithoutMentions,
} from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";

export async function resolveAndCreateUserMentions(
  auth: Authenticator,
  {
    mentions,
    message,
    conversation,
  }: {
    mentions: MentionType[];
    message: AgentMessageTypeWithoutMentions | UserMessageTypeWithoutMentions;
    conversation: ConversationWithoutContentType;
  }
) {
  return createUserMentions(auth, {
    resolvedMentions: await resolveUserMentions(auth, {
      mentions,
      conversation,
      message,
    }),
    message,
    conversation,
  });
}
