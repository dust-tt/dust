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
  GPT_4_1_MINI_MODEL_CONFIG,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  UserMessageTypeModel,
} from "@app/types";
import { isString } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

function toBasicContentChunk(
  content: Content
): TextBlockParam | ImageBlockParam {
  switch (content.type) {
    case "text":
      return {
        type: "text",
        text: content.text,
      };
    case "image_url":
      return {
        type: "image",
        source: {
          type: "url",
          url: content.image_url.url,
        },
      };
  }
}

function toContentChunk(
  content:
    | Content
    | TextContentType
    | ReasoningContentType
    | FunctionCallContentType
): TextBlockParam | ImageBlockParam | ThinkingBlockParam | ToolUseBlockParam {
  switch (content.type) {
    case "text":
    case "image_url":
      return toBasicContentChunk(content);
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
        /*TODO(DIRECT_LLM 2025-10-24) Signatures should be stored in AnthropicLLM's metadata of
         * thinking events and re-extracted */
        signature: "",
      };
    case "function_call":
      return {
        type: "tool_use",
        id: content.value.id,
        name: content.value.name,
        input: JSON.parse(content.value.arguments),
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
      : message.content.map(toBasicContentChunk),
  };
}

function functionMessage(message: FunctionMessageTypeModel): MessageParam {
  return {
    role: "user",
    content: [toolResultToContent(message)],
  };
}

function userMessage(message: UserMessageTypeModel): MessageParam {
  return {
    role: "user",
    content: isString(message.content)
      ? [{ type: "text", text: message.content }]
      : message.content.map(toContentChunk),
  };
}

function assistantMessage(
  message:
    | AssistantFunctionCallMessageTypeModel
    | AssistantContentMessageTypeModel
): MessageParam {
  return {
    role: "assistant",
    content: message.contents.map(toContentChunk).sort((a, b) => {
      // We want to make sure the "tool_use" call is at the end of the contents
      // Because the following "tool_result" is expected to follow it immediately
      const A = a.type === "tool_use";
      const B = b.type === "tool_use";

      return A === B ? 0 : A ? 1 : -1;
    }),
  };
}

export function toMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): MessageParam {
  switch (message.role) {
    case "user":
      return userMessage(message);
    case "function":
      return functionMessage(message);
    case "assistant":
      return assistantMessage(message);
  }
}

export function toTool(tool: AgentActionSpecification): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: "object" },
  };
}
