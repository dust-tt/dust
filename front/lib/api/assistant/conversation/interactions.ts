import type {
  Interaction,
  MinimalMessageType,
} from "@app/lib/api/assistant/conversation_rendering/pruning";

/**
 * Group messages into interactions (user turn + agent responses),
 * using turn type (user/content_fragment vs assistant/function) as the delimiter.
 *
 * A compaction message acts as an era boundary: all interactions before it are discarded and the
 * compaction summary starts a fresh era. This mirrors the fact that all messages before a succeeded
 * compaction are already summarized in its content.
 *
 * Example: [content_fragment, user, content_fragment, user, assistant, function, function]
 * results in a single interaction.
 */
export function groupMessagesIntoInteractions<T extends MinimalMessageType>(
  messages: T[]
): Interaction<T>[] {
  const interactions: Interaction<T>[] = [];
  let currentInteraction: T[] = [];

  // Determine the high-level turn type for a message.
  // - "user": user messages and content fragments
  // - "agent": assistant messages and tool/function results
  // - "compaction": compaction summary boundary
  const turnTypeForMessage = (message: T): "user" | "agent" | "compaction" => {
    if (message.role === "compaction") {
      return "compaction";
    }
    if (message.role === "user" || message.role === "content_fragment") {
      return "user";
    }
    // Includes "assistant" and "function" roles.
    return "agent";
  };

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    // A compaction message starts a new era: discard all previous interactions and the current
    // in-progress interaction. The compaction summary becomes the first message of a new era.
    if (turnTypeForMessage(message) === "compaction") {
      interactions.length = 0;
      currentInteraction = [message];

      // If this is the last message, flush the interaction.
      if (i === messages.length - 1) {
        interactions.push({ messages: currentInteraction });
        currentInteraction = [];
      }
      continue;
    }

    currentInteraction.push(message);

    const isLastMessage = i === messages.length - 1;

    // Decide if we should close the current interaction.
    // We close when:
    // - it's the last message, or
    // - the next message is a "user" turn while the current message is an "agent" turn.
    // This ensures that all consecutive user/content_fragment messages remain in the same
    // user turn, followed by all agent/tool messages for that interaction.
    const shouldClose = (() => {
      if (isLastMessage) {
        return true;
      }
      const currentTurn = turnTypeForMessage(message);
      const nextTurn = turnTypeForMessage(messages[i + 1]);
      return currentTurn === "agent" && nextTurn === "user";
    })();

    if (shouldClose) {
      interactions.push({ messages: currentInteraction });
      currentInteraction = [];
    }
  }

  return interactions;
}
