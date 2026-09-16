import type { Output } from "@app/temporal/agent_loop/lib/types";
import type {
  AgentContentItemType,
  AgentErrorContentType,
} from "@app/types/assistant/agent_message_content";
import type {
  AssistantFunctionCallMessageTypeModel,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";

/**
 * Datadog AI Guard message shape (subset of their evaluate API).
 */
export type InferenceHookTranscriptMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

function textFromAgentContents(
  contents:
    | Array<Exclude<AgentContentItemType, AgentErrorContentType>>
    | undefined
): string {
  if (!contents) {
    return "";
  }
  return contents
    .filter((c) => c.type === "text_content")
    .map((c) => c.value)
    .join("\n");
}

function functionContentToText(
  content: string | Array<{ type: string; text?: string }>
): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter(isTextContent)
    .map((c) => c.text)
    .join("\n");
}

function mapModelMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): InferenceHookTranscriptMessage[] {
  switch (message.role) {
    case "user": {
      const content = message.content
        .filter(isTextContent)
        .map((c) => c.text)
        .join("\n");
      return [{ role: "user", content }];
    }
    case "assistant": {
      const content =
        textFromAgentContents(message.contents) || message.content || "";
      const toolCalls =
        "function_calls" in message ? (message.function_calls ?? []) : [];
      if (toolCalls.length === 0) {
        return [{ role: "assistant", content }];
      }
      return [
        {
          role: "assistant",
          content,
          tool_calls: toolCalls.map((fc) => ({
            id: fc.id,
            function: { name: fc.name, arguments: fc.arguments },
          })),
        },
      ];
    }
    case "function": {
      return [
        {
          role: "tool",
          content: functionContentToText(message.content),
          tool_call_id: message.function_call_id,
        },
      ];
    }
    case "compaction":
      return [{ role: "user", content: message.content }];
    default:
      return [];
  }
}

/**
 * Build the evaluate transcript. AI Guard scores the last message.
 * Include system prompt first when provided so policy context is present.
 */
export function buildInferenceHookTranscript({
  systemPrompt,
  modelConversation,
  trailingAssistant,
}: {
  systemPrompt?: string | null;
  modelConversation: ModelConversationTypeMultiActions;
  trailingAssistant?: AssistantFunctionCallMessageTypeModel | null;
}): InferenceHookTranscriptMessage[] {
  const messages: InferenceHookTranscriptMessage[] = [];

  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const message of modelConversation.messages) {
    messages.push(...mapModelMessage(message));
  }

  if (trailingAssistant) {
    messages.push(...mapModelMessage(trailingAssistant));
  }

  return messages;
}

/** Convert a model step output into the trailing assistant message for evaluate. */
export function trailingAssistantFromOutput(
  output: Output
): AssistantFunctionCallMessageTypeModel {
  const functionCalls = output.contents
    .filter((c) => c.type === "function_call")
    .map((c) => c.value);

  const contents = output.contents.filter(
    (
      c
    ): c is Exclude<
      AgentContentItemType,
      AgentErrorContentType | { type: "provider_passthrough"; value: unknown }
    > =>
      c.type === "text_content" ||
      c.type === "function_call" ||
      c.type === "reasoning"
  );

  return {
    role: "assistant",
    content: output.generation ?? undefined,
    function_calls: functionCalls,
    contents: contents as AssistantFunctionCallMessageTypeModel["contents"],
  };
}
