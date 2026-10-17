import type { ChatMessage } from "@microsoft/microsoft-graph-types";

/**
 * Teams channel thread activities carry the thread root message id inside the
 * Bot Framework conversation id, e.g.
 * "19:abc@thread.tacv2;messageid=1690271996123".
 * Channel root posts and group chats have no such suffix.
 */
export function getRootMessageIdFromConversationId(
  conversationId: string
): string | undefined {
  return conversationId.match(/;messageid=([^;]+)/i)?.[1] || undefined;
}

/**
 * Extracts the team and channel ids needed to call the channel messages
 * Graph endpoints from a Bot Framework Teams activity's channelData. Teams
 * sends both flat ("teamsTeamId"/"teamsChannelId") and nested
 * ("team"/"channel") shapes depending on the activity.
 */
export function getChannelThreadLocation(channelData: unknown): {
  teamId?: string;
  channelId?: string;
} {
  if (!channelData || typeof channelData !== "object") {
    return {};
  }
  const data = channelData as {
    teamsTeamId?: unknown;
    teamsChannelId?: unknown;
    team?: { id?: unknown };
    channel?: { id?: unknown };
  };
  const teamId =
    typeof data.teamsTeamId === "string"
      ? data.teamsTeamId
      : typeof data.team?.id === "string"
        ? data.team.id
        : undefined;
  const channelId =
    typeof data.teamsChannelId === "string"
      ? data.teamsChannelId
      : typeof data.channel?.id === "string"
        ? data.channel.id
        : undefined;
  return { teamId, channelId };
}

/**
 * Returns a copy of the messages ordered newest-first. The channel messages
 * endpoints do not support $orderby, so callers must not rely on the
 * response order.
 */
export function sortMessagesByCreatedDateTimeDesc<
  T extends Pick<ChatMessage, "createdDateTime">,
>(messages: T[]): T[] {
  return [...messages].sort(
    (a, b) =>
      new Date(b.createdDateTime ?? 0).getTime() -
      new Date(a.createdDateTime ?? 0).getTime()
  );
}

/**
 * Selects the thread messages to hand to the agent as conversation history:
 * messages older than the current one, down to (and excluding) the last bot
 * reply, or down to (and including) the thread root message when there is no
 * previous bot reply. Only user-authored messages are kept.
 *
 * `messages` must be ordered newest-first. When the anchor (last bot reply
 * or root message) is not part of the fetched page, there is no cutoff: all
 * fetched messages older than the current one are kept. Every message in a
 * thread page belongs to the thread the bot was mentioned in, so this stays
 * within the thread's scope.
 *
 * Conversations without a thread anchor (no previous bot reply and no root
 * message id, e.g. a first mention in a group chat) keep the existing
 * behavior: no history is attached.
 */
export function selectThreadHistoryMessages({
  messages,
  currentMessageId,
  lastBotMessageId,
  rootMessageId,
}: {
  messages: ChatMessage[];
  currentMessageId?: string;
  lastBotMessageId?: string;
  rootMessageId?: string;
}): ChatMessage[] {
  // The current message is sent as the user message itself, so it must not
  // be duplicated in the history fragment.
  const startIndex = currentMessageId
    ? messages.findIndex((msg) => msg.id === currentMessageId) + 1
    : 0;

  let endIndex: number;
  if (lastBotMessageId) {
    endIndex = messages.findIndex((msg) => msg.id === lastBotMessageId);
  } else if (rootMessageId) {
    const rootIndex = messages.findIndex((msg) => msg.id === rootMessageId);
    // +1 so the root message itself is included in the history. When the
    // root is absent from the fetched page (e.g. its fetch failed), there is
    // no cutoff: every fetched message still belongs to the same thread.
    endIndex = rootIndex >= 0 ? rootIndex + 1 : -1;
  } else {
    // No thread anchor (first mention in a chat, or a channel root post):
    // preserve the existing behavior of attaching no history.
    endIndex = 0;
  }

  const messagesToConsider =
    endIndex >= 0
      ? messages.slice(startIndex, endIndex)
      : messages.slice(startIndex);

  return messagesToConsider.filter((message) => message.from?.user);
}
