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
import {
  assertNever,
  isString,
  normalizeError,
  safeParseJSON,
} from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
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
  content: TextContentType | ReasoningContentType | FunctionCallContentType
): TextBlockParam | ImageBlockParam | ThinkingBlockParam | ToolUseBlockParam {
  switch (content.type) {
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "reasoning":
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      let signature = "";
      try {
        const metadata = JSON.parse(content.value.metadata);
        signature = metadata.signature || "";
      } catch (e) {
        throw new Error(
          `Failed to parse reasoning metadata JSON: ${normalizeError(e).message}`
        );
      }
      return {
        type: "thinking",
        thinking: content.value.reasoning,
        signature: signature,
      };
    case "function_call": {
      const argsRes = safeParseJSON(content.value.arguments);
      if (argsRes.isErr()) {
        throw new Error(
          `Failed to parse function call arguments JSON: ${argsRes.error.message}`
        );
      }
      return {
        type: "tool_use",
        id: content.value.id,
        name: content.value.name,
        input: argsRes.value,
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
