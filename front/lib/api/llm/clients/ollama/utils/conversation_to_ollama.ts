import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  UserMessageTypeModel,
} from "@app/types/assistant/generation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Message, Tool, ToolCall } from "ollama";

export function toOllamaTool(specification: AgentActionSpecification): Tool {
  return {
    type: "function",
    function: {
      name: specification.name,
      description: specification.description,
      parameters: specification.inputSchema as Tool["function"]["parameters"],
    },
  };
}

function userMessageToOllama(message: UserMessageTypeModel): Message {
  const textParts = message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text);
  const imageParts = message.content
    .filter((c) => c.type === "image_url")
    .map((c) => c.image_url.url);

  return {
    role: "user",
    content: textParts.join(""),
    ...(imageParts.length > 0 ? { images: imageParts } : {}),
  };
}

function functionMessageToOllama(message: FunctionMessageTypeModel): Message {
  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");

  return {
    role: "tool",
    content,
    tool_name: message.name,
  };
}

function assistantContentToParts(
  content:
    | AgentReasoningContentType
    | AgentTextContentType
    | AgentFunctionCallContentType
): { text?: string; thinking?: string; toolCall?: ToolCall } {
  switch (content.type) {
    case "reasoning":
      return { thinking: content.value.reasoning ?? undefined };
    case "text_content":
      return { text: content.value };
    case "function_call": {
      return {
        toolCall: {
          function: {
            name: content.value.name,
            arguments: parseToolArguments(
              content.value.arguments,
              content.value.name
            ),
          },
        },
      };
    }
    default:
      assertNever(content);
  }
}

function assistantMessageToOllama(
  message:
    | AssistantContentMessageTypeModel
    | AssistantFunctionCallMessageTypeModel
): Message {
  const parts = (message.contents ?? []).map(assistantContentToParts);

  const textContent = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  const thinking = parts.map((p) => p.thinking ?? "").join("") || undefined;
  const toolCalls = parts.flatMap((p) => (p.toolCall ? [p.toolCall] : []));

  return {
    role: "assistant",
    content: textContent,
    ...(thinking ? { thinking } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

export function toOllamaMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): Message {
  switch (message.role) {
    case "user":
      return userMessageToOllama(message);
    case "function":
      return functionMessageToOllama(message);
    case "assistant":
      return assistantMessageToOllama(message);
    default:
      assertNever(message);
  }
}
