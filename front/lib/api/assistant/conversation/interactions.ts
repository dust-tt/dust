import type {
  InteractionWithTokens,
  MinimalMessageType,
} from "@app/lib/api/assistant/conversation_rendering/pruning";

/**
 * Group messages into interactions (user turn + agent responses),
 * using turn type (user/content_fragment vs assistant/function) as the delimiter.
 *
 * Example: [content_fragment, user, content_fragment, user, assistant, function, function]
 * results in a single interaction.
 */
export function groupMessagesIntoInteractions<T extends MinimalMessageType>(
  messages: T[]
): InteractionWithTokens<T>[] {
  const interactions: InteractionWithTokens<T>[] = [];
  let currentInteraction: T[] = [];

  // Determine the high-level turn type for a message.
  // - "user": user messages and content fragments
  // - "agent": assistant messages and tool/function results
  const turnTypeForMessage = (message: T): "user" | "agent" => {
    if (message.role === "user" || message.role === "content_fragment") {
      return "user";
    }
    // Includes "assistant" and "function" roles
    return "agent";
  };

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
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
