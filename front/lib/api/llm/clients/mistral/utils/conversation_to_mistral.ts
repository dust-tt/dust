import type {
  AssistantMessage,
  ChatCompletionStreamRequest,
  ContentChunk,
  Tool,
} from "@mistralai/mistralai/models/components";
import assert from "assert";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  AssistantMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  TextContent,
  UserContent,
} from "@app/types";
import { assertNever } from "@app/types";
import type { ReasoningContent } from "@app/types/assistant/agent_message_content";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";

function toContentChunk(content: UserContent | ReasoningContent): ContentChunk {
  switch (content.type) {
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "image_url":
      return {
        type: "image_url",
        imageUrl: content.value.image_url,
      };
    case "reasoning":
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
  message: AssistantMessageTypeModel
): AssistantMessage & { role: "assistant" } {
  assert(message.contents, "Assistant message is missing contents");

  const textContents = message.contents
    .filter(
      (c): c is TextContent | ReasoningContent => !isFunctionCallContent(c)
    )
    .map(toContentChunk);
  const toolCalls = message.contents
    .filter(isFunctionCallContent)
    .map((fc) => ({
      id: fc.value.id,
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
      return {
        role: "tool",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map(toContentChunk),
        name: message.name,
        toolCallId: message.function_call_id,
      };
    }
    case "assistant": {
      return toAssistantMessage(message);
    }
    default:
      assertNever(message);
  }
}
