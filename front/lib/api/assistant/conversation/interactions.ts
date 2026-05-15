import type {
  Interaction,
  MinimalMessageType,
} from "@app/lib/api/assistant/conversation_rendering/pruning";

/**
 * Group messages into interactions (user turn + agent responses), using turn type
 * (user/content_fragment vs assistant/function) as the delimiter.
 *
 * A compaction message acts as an interaction boundary: it closes the current interaction and
 * starts a new one. Pre-compaction messages should already have been filtered out by
 * renderAllMessages before reaching this function.
 *
 * Example: [content_fragment, user, content_fragment, user, assistant, function, function]
 * results in a single interaction.
 */
export function groupMessagesIntoInteractions<T extends MinimalMessageType>(
  messages: T[]
): Interaction<T>[] {
  const interactions: Interaction<T>[] = [];
  let currentInteraction: T[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    // A compaction message closes the current interaction (if any) and starts a new one. The
    // compaction summary is the first message of the next interaction.
    if (message.role === "compaction") {
      if (currentInteraction.length > 0) {
        interactions.push({ messages: currentInteraction });
      }
      currentInteraction = [message];
      continue;
    }

    currentInteraction.push(message);

    const isLastMessage = i === messages.length - 1;

    // Decide if we should close the current interaction.
    // We close when:
    // - it's the last message, or
    // - the next message is a user message or content fragment while the current message is an
    //   agent message,
    // - the next message is a user message or content fragment while the current message is a user
    //   message (otherwise triggers can accumulate and exhaust context),
    // - the next message is a compaction boundary (above).
    // This keeps content fragments attached to the following user message while splitting
    // successive user turns.
    const shouldClose = (() => {
      if (isLastMessage) {
        return true;
      }
      const currentRole = message.role;
      const nextRole = messages[i + 1].role;

      const currentIsAgent =
        currentRole === "agent" ||
        currentRole === "assistant" ||
        currentRole === "function";
      const nextIsUser = nextRole === "user" || nextRole === "content_fragment";

      return (
        (currentIsAgent && nextIsUser) || (currentRole === "user" && nextIsUser)
      );
    })();

    if (shouldClose) {
      interactions.push({ messages: currentInteraction });
      currentInteraction = [];
    }
  }

  // Flush any remaining messages (e.g. a trailing compaction message).
  if (currentInteraction.length > 0) {
    interactions.push({ messages: currentInteraction });
  }

  return interactions;
}
