import type {
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
  ThinkingBlockParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import assert from "assert";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  UserMessageTypeModel,
} from "@app/types";
import { isFunctionMessage, isString } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

function toContentChunk(
  content:
    | Content
    | TextContentType
    | ReasoningContentType
    | FunctionCallContentType
): TextBlockParam | ImageBlockParam | ThinkingBlockParam | ToolUseBlockParam {
  switch (content.type) {
    case "text":
      return {
        type: "text",
        text: content.text,
      };
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "reasoning":
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      return {
        type: "thinking",
        thinking: content.value.reasoning,
        /** @todo: signatures should be stored in AnthropicLLM's metadata of
         * thinking events and re-extracted */
        signature: "",
      };
    case "image_url":
      return {
        type: "image",
        source: {
          type: "url",
          url: content.image_url.url,
        },
      };
    case "function_call":
      return {
        type: "tool_use",
        id: content.value.id,
        name: content.value.name,
        input: content.value.arguments,
      };
  }
}

function toolResultToContent(
  message: FunctionMessageTypeModel
): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: message.function_call_id,
    content: isString(message.content)
      ? message.content
      : message.content
          .map(toContentChunk)
          .filter(
            (c): c is TextBlockParam | ImageBlockParam =>
              c.type !== "thinking" && c.type !== "tool_use"
          ),
  };
}

function toUserMessage(
  message: UserMessageTypeModel | FunctionMessageTypeModel
): MessageParam {
  if (isFunctionMessage(message)) {
    return {
      role: "user",
      content: [toolResultToContent(message)],
    };
  } else {
    return {
      role: "user",
      content: isString(message.content)
        ? [{ type: "text", text: message.content }]
        : message.content.map(toContentChunk),
    };
  }
}

function toAssistantMessage(
  message:
    | AssistantFunctionCallMessageTypeModel
    | AssistantContentMessageTypeModel
): MessageParam {
  assert(message.contents, "Assistant message is missing contents");
  return {
    role: "assistant",
    content: message.contents.map(toContentChunk),
  };
}

export function toMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): MessageParam {
  switch (message.role) {
    case "user":
    case "function":
      return toUserMessage(message);
    case "assistant":
      return toAssistantMessage(message);
  }
}

export function toTool(tool: AgentActionSpecification): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: "object" },
  };
}
