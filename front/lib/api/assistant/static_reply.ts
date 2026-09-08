import type {
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isReinforcedSkillNotificationMetadata } from "@app/types/assistant/conversation";

export const ANALYTICS_PANEL_GREETING = `I can help you understand your workspace usage and costs across your analytics data.

A few things you could ask:
- Which agents are used the most?
- How has my workspace's spend evolved over the last 30 days?
- Who are my most active users?`;

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
  conversation: ConversationWithoutContentType;
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

  // A constant rather than the message content, which here is the hidden bootstrap message.
  if (
    userMessage.context.origin === "analytics_panel" &&
    userMessage.rank === 0
  ) {
    return ANALYTICS_PANEL_GREETING;
  }

  return undefined;
}
