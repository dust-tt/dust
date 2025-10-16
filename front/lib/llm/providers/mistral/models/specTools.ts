import type { Messages } from "@mistralai/mistralai/models/components";

import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";

// Mistral message types for different content structures
export type MistralTextContent = {
  type: "text";
  text: string;
};

export type MistralImageContent = {
  type: "image_url";
  imageUrl: string;
};

export type MistralToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type MistralToolResult = {
  call_id: string;
  content: string;
};

export interface MistralMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | (MistralTextContent | MistralImageContent)[];
  tool_calls?: MistralToolCall[];
}

export function conversationToMistralInput(
  input: FinalModelConversationType
): Messages[] {
  const { messages } = input;
  const result: Messages[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      // Transform to Mistral Messages with role "user"
      const textContent = Array.isArray(message.content)
        ? message.content
            .map((c) => {
              if (c.type === "text") {
                return c.text;
              }
              return String(c);
            })
            .join("\n")
        : String(message.content || "");

      result.push({
        role: "user",
        content: textContent,
      });
    } else if (message.role === "function") {
      // Transform function result to tool message
      result.push({
        role: "tool",
        content:
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
        name: message.name, // Mistral may expect this for tool results
        toolCallId: message.function_call_id,
      } as Messages);
    } else if (message.role === "assistant") {
      // Check if it has function_calls property
      if ("function_calls" in message && message.function_calls) {
        // Transform to assistant message with tool_calls
        const toolCalls = message.function_calls.map((fc) => ({
          id: fc.id,
          type: "function" as const,
          function: {
            name: fc.name,
            arguments: fc.arguments,
          },
        }));

        result.push({
          role: "assistant",
          content: message.content ?? "",
          toolCalls: toolCalls,
        } as Messages);
      } else {
        // Transform to regular assistant message
        result.push({
          role: "assistant",
          content: message.content ?? "",
        });
      }
    }
  }

  // Filter out messages with empty content to avoid Mistral API errors
  return result.filter((message) => {
    if (typeof message.content === "string") {
      return message.content.trim() !== "" || "toolCalls" in message;
    }
    if (Array.isArray(message.content)) {
      return (
        message.content.length > 0 &&
        message.content.some(
          (block) =>
            (block.type === "text" && block.text && block.text.trim() !== "") ||
            block.type === "image_url"
        )
      );
    }
    return false;
  });
}
