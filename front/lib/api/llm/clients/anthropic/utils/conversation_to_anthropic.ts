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
import { extractEncryptedContentFromMetadata } from "@app/lib/api/llm/utils";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  UserMessageTypeModel,
} from "@app/types";
import { assertNever, isString } from "@app/types";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";

function userContentToParam(
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

function assistantContentToParam(
  content:
    | AgentTextContentType
    | AgentReasoningContentType
    | AgentFunctionCallContentType
): TextBlockParam | ImageBlockParam | ThinkingBlockParam | ToolUseBlockParam {
  switch (content.type) {
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "reasoning":
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      const signature = extractEncryptedContentFromMetadata(
        content.value.metadata
      );
      return {
        type: "thinking",
        thinking: content.value.reasoning,
        signature: signature,
      };
    case "function_call": {
      return {
        type: "tool_use",
        id: content.value.id,
        name: content.value.name,
        input: parseToolArguments(content.value.arguments, content.value.name),
      };
    }
  }
}

function toolResultToParam(
  message: FunctionMessageTypeModel
): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: message.function_call_id,
    content: isString(message.content)
      ? message.content
      : message.content.map(userContentToParam),
  };
}

function functionMessage(message: FunctionMessageTypeModel): MessageParam {
  return {
    role: "user",
    content: [toolResultToParam(message)],
  };
}

function userMessage(message: UserMessageTypeModel): MessageParam {
  return {
    role: "user",
    content: message.content.map(userContentToParam),
  };
}

function assistantMessage(
  message:
    | AssistantFunctionCallMessageTypeModel
    | AssistantContentMessageTypeModel
): MessageParam {
  const contents = message.contents.map(assistantContentToParam);

  return {
    role: "assistant",
    content: contents,
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
    default:
      assertNever(message);
  }
}

export function toTool(tool: AgentActionSpecification): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: "object" },
  };
}
