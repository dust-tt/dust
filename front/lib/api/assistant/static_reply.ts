import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isReinforcedSkillNotificationMetadata } from "@app/types/assistant/conversation";

/**
 * Returns pre-formatted text that the Dust global agent should echo as its
 * NOOP static reply for this turn, or `undefined` to fall back to the normal
 * LLM-driven response.
 *
 * Today only the skill-suggestion notification flow uses this: it posts hidden
 * user messages whose content is exactly the message we want Dust to display
 * (initial TODO list, accept/reject status updates). Adding a new caller is a
 * matter of recognizing it here — keep `dust.ts` and the agent-run plumbing
 * generic.
 */
export function getStaticReplyForUserMessage({
  conversation,
  userMessage,
}: {
  conversation: ConversationType;
  userMessage: UserMessageType;
}): string | undefined {
  if (
    isReinforcedSkillNotificationMetadata(
      conversation.metadata?.reinforcedSkillNotification
    ) &&
    userMessage.context.origin === "reinforced_skill_notification"
  ) {
    return userMessage.content;
  }
  return undefined;
}
