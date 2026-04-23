import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import type {
  AgentMessageType,
  ConversationType,
  MessageFeedback,
} from "@app/types/assistant/conversation";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_CONTENT_CHARS_PER_MESSAGE = 2_000;
const MAX_TOTAL_CONTENT_CHARS = 20_000;

export async function renderConversationAsTextWithFeedback(
  auth: Authenticator,
  {
    conversationId,
    fromMessageIndex,
    toMessageIndex,
    includeActionDetails,
  }: {
    conversationId: string;
    fromMessageIndex?: number;
    toMessageIndex?: number;
    /** When true, include tool input (params) and output for each action. */
    includeActionDetails?: boolean;
  }
): Promise<
  Result<
    {
      type: "text";
      text: string;
    },
    Error
  >
> {
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err(
      new Error(`Conversation not found or not accessible: ${conversationId}`)
    );
  }

  const conversation = await enrichConversationWithFeedback(
    auth,
    conversationRes.value
  );
  const text = renderConversationAsText(conversation, {
    includeTimestamps: true,
    includeActions: true,
    includeActionDetails,
    includeFeedback: true,
    truncateMessageChars: MAX_CONTENT_CHARS_PER_MESSAGE,
    truncateTotalChars: MAX_TOTAL_CONTENT_CHARS,
    fromMessageIndex,
    toMessageIndex,
  });

  return new Ok({ type: "text" as const, text });
}

async function enrichConversationWithFeedback(
  auth: Authenticator,
  conversation: ConversationType
): Promise<ConversationType> {
  const feedbacks =
    await AgentMessageFeedbackResource.listByConversationModelId(
      auth,
      conversation.id
    );
  if (feedbacks.length === 0) {
    return conversation;
  }

  const feedbackByAgentMessageId = new Map<number, MessageFeedback[]>();
  for (const f of feedbacks) {
    const list = feedbackByAgentMessageId.get(f.agentMessageId) ?? [];
    list.push({ thumbDirection: f.thumbDirection, content: f.content });
    feedbackByAgentMessageId.set(f.agentMessageId, list);
  }

  return {
    ...conversation,
    content: conversation.content.map((versions) =>
      isAgentMessageRow(versions)
        ? versions.map((msg) => attachFeedback(msg, feedbackByAgentMessageId))
        : versions
    ),
  };
}

function isAgentMessageRow(
  versions: ConversationType["content"][number]
): versions is AgentMessageType[] {
  return versions.length > 0 && isAgentMessageType(versions[0]);
}

function attachFeedback(
  msg: AgentMessageType,
  feedbackByAgentMessageId: Map<number, MessageFeedback[]>
): AgentMessageType & { feedback: MessageFeedback[] } {
  return {
    ...msg,
    feedback: feedbackByAgentMessageId.get(msg.agentMessageId) ?? [],
  };
}
