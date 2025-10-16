import type Anthropic from "@anthropic-ai/sdk";

import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";

// Anthropic message param types for different content types
export type AnthropicTextContent = {
  type: "text";
  text: string;
};

export type AnthropicToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
};

export type AnthropicToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | (AnthropicTextContent | AnthropicToolUseContent | AnthropicToolResultContent)[];
}

export function conversationToAnthropicInput(
  input: FinalModelConversationType
): Anthropic.MessageParam[] {
  const { messages } = input;
  const result: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      // Transform to Anthropic MessageParam with role "user"
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
      // Transform function result to tool_result content
      const toolResultContent: AnthropicToolResultContent = {
        type: "tool_result",
        tool_use_id: message.function_call_id,
        content: typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
      };

      // Tool results must be in user messages according to Anthropic API
      result.push({
        role: "user",
        content: [toolResultContent],
      });
    } else if (message.role === "assistant") {
      // Check if it has function_calls property
      if ("function_calls" in message && message.function_calls) {
        // Transform to tool_use content blocks
        const content: (AnthropicTextContent | AnthropicToolUseContent)[] = [];

        // Add text content if present
        if (message.content) {
          content.push({
            type: "text",
            text: message.content,
          });
        }

        // Add tool use content for each function call
        for (const fc of message.function_calls) {
          content.push({
            type: "tool_use",
            id: fc.id,
            name: fc.name,
            input: JSON.parse(fc.arguments),
          });
        }

        result.push({
          role: "assistant",
          content: content,
        });
      } else {
        // Transform to regular assistant message
        result.push({
          role: "assistant",
          content: message.content || "",
        });
      }
    }
  }

  return result;
}