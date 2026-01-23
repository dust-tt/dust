import type {
  AssistantMessage,
  ChatCompletionStreamRequest,
  ContentChunk,
  Tool,
} from "@mistralai/mistralai/models/components";
import assert from "assert";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types";
import { assertNever, safeParseJSON } from "@app/types";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";

export function sanitizeToolCallId(id: string): string {
  // Replace anything not a-zA-Z-0-9 with 0 as mistral enforces that but function_call_id can
  // come from other providers. Also enforces length 9.
  let s = id.replace(/[^a-zA-Z0-9]/g, "0");

  if (s.length > 9) {
    s = s.slice(0, 9);
  }
  if (s.length < 9) {
    s = s.padStart(9, "0");
  }
  return s;
}

function removeReferenceKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeReferenceKeys);
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "reference") {
      result[key] = removeReferenceKeys(value);
    }
  }
  return result;
}

function toContentChunk(
  content: Content | AgentTextContentType | AgentReasoningContentType
): ContentChunk {
  switch (content.type) {
    case "text":
      return content;
    case "image_url":
      return {
        type: "image_url",
        imageUrl: content.image_url.url,
      };
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "reasoning": {
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      return {
        type: "thinking",
        thinking: [{ type: "text", text: content.value.reasoning }],
      };
    }
    default:
      assertNever(content);
  }
}

function toAssistantMessage(
  message:
    | AssistantFunctionCallMessageTypeModel
    | AssistantContentMessageTypeModel
): AssistantMessage & { role: "assistant" } {
  assert(message.contents, "Assistant message is missing contents");

  const textContents = message.contents
    .filter(
      (c): c is AgentTextContentType | AgentReasoningContentType =>
        c.type !== "function_call"
    )
    .map(toContentChunk);
  const toolCalls = message.contents
    .filter(
      (c): c is AgentFunctionCallContentType => c.type === "function_call"
    )
    .map((fc) => ({
      id: sanitizeToolCallId(fc.value.id),
      function: {
        name: fc.value.name,
        arguments: fc.value.arguments,
      },
    }));

  return {
    role: "assistant",
    content: textContents.length > 0 ? textContents : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export function toTool(specification: AgentActionSpecification): Tool {
  return {
    type: "function",
    function: {
      name: specification.name,
      description: specification.description,
      parameters: specification.inputSchema,
      strict: false,
    },
  };
}

export function toMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): ChatCompletionStreamRequest["messages"][number] {
  switch (message.role) {
    case "user": {
      return {
        role: "user",
        content: message.content.map(toContentChunk),
      };
    }
    case "function": {
      if (typeof message.content === "string") {
        const parsedContentRes = safeParseJSON(message.content);
        if (
          parsedContentRes.isErr() ||
          message.name !== "web_search_browse__websearch"
        ) {
          return {
            role: "tool",
            content: message.content,
            name: message.name,
            toolCallId: sanitizeToolCallId(message.function_call_id),
          };
        }

        // There is a conflict with Mistral web search tool that is supposed to send back reference ids as number
        // But we send to mistral string references which makes the Mistral client invalidate the event it send back
        const cleanedContent = removeReferenceKeys(parsedContentRes.value);
        return {
          role: "tool",
          content: JSON.stringify(cleanedContent),
          name: message.name,
          toolCallId: sanitizeToolCallId(message.function_call_id),
        };
      }

      return {
        role: "tool",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map(toContentChunk),
        name: message.name,
        toolCallId: sanitizeToolCallId(message.function_call_id),
      };
    }
    case "assistant": {
      return toAssistantMessage(message);
    }
    default:
      assertNever(message);
  }
}
