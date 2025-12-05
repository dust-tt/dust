import assert from "node:assert";

import type {
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { ResponseFormatJSONSchema } from "openai/resources/shared";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { parseResponseFormatSchema } from "@app/lib/api/llm/utils";
import type {
  ModelConversationTypeMultiActions,
  ReasoningEffort,
} from "@app/types";
import type {
  Content,
  FunctionMessageTypeModel,
  UserMessageTypeModel,
} from "@app/types";
import { assertNever } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

type ChatCompletionContentPart =
  | ChatCompletionContentPartText
  | ChatCompletionContentPartImage;

function toContentPart(content: Content): ChatCompletionContentPart {
  switch (content.type) {
    case "text":
      return { type: "text", text: content.text };
    case "image_url":
      return {
        type: "image_url",
        image_url: {
          url: content.image_url.url,
          detail: "auto",
        },
      };
  }
}

function toUserMessage(
  message: UserMessageTypeModel
): ChatCompletionMessageParam {
  return {
    role: "user",
    content: message.content.map(toContentPart),
  };
}

function toAssistantMessages(
  contents: AgentContentItemType[]
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  const assistantContent: string[] = [];
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const content of contents) {
    switch (content.type) {
      case "text_content":
        assistantContent.push(content.value);
        break;
      case "function_call":
        toolCalls.push({
          id: content.value.id,
          type: "function",
          function: {
            name: content.value.name,
            arguments: content.value.arguments,
          },
        });
        break;
      case "reasoning":
        assert(content.value.reasoning, "Expected non-null reasoning content");
        // For reasoning, we add it as text content
        assistantContent.push(content.value.reasoning);
        break;
      case "error":
        assistantContent.push(content.value.message);
        break;
      default:
        assertNever(content);
    }
  }

  // Create a single assistant message with both content and tool calls if present
  if (assistantContent.length > 0 || toolCalls.length > 0) {
    messages.push({
      role: "assistant",
      content: assistantContent.length > 0 ? assistantContent.join("\n") : null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
  }

  return messages;
}

function toToolMessage(
  message: FunctionMessageTypeModel
): ChatCompletionMessageParam {
  return {
    role: "tool",
    tool_call_id: message.function_call_id,
    content:
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
  };
}

export function toMessages(
  prompt: string,
  conversation: ModelConversationTypeMultiActions,
  promptRole: "system" | "developer" = "developer"
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];
  messages.push({
    role: promptRole,
    content: prompt,
  });

  for (const message of conversation.messages) {
    switch (message.role) {
      case "user":
        messages.push(toUserMessage(message));
        break;
      case "assistant":
        messages.push(...toAssistantMessages(message.contents));
        break;
      case "function":
        messages.push(toToolMessage(message));
        break;
      default:
        assertNever(message);
    }
  }
  return messages;
}

export function toTools(
  specifications: AgentActionSpecification[]
): ChatCompletionTool[] {
  return specifications.map((tool) => {
    const properties = tool.inputSchema.properties ?? {};
    const parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    } = {
      type: "object",
      properties,
      // OpenAI requires all properties to be marked as required
      required: Object.keys(properties),
      additionalProperties: false,
    };

    return {
      type: "function",
      function: {
        strict: true,
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}

type ReasoningParam = "low" | "medium" | "high";

const REASONING_EFFORT_TO_OPENAI: {
  [key in ReasoningEffort]: "low" | "medium" | "high" | undefined;
} = {
  none: undefined,
  light: "low",
  medium: "medium",
  high: "high",
};

export function toReasoningParam(
  reasoningEffort: ReasoningEffort | null,
  useNativeLightReasoning?: boolean
): ReasoningParam | undefined {
  if (!reasoningEffort) {
    return undefined;
  }

  const effort = REASONING_EFFORT_TO_OPENAI[reasoningEffort];
  if (reasoningEffort !== "light" || useNativeLightReasoning) {
    // For light, we might not use native reasoning but Chain of Thought instead
    return effort;
  }
  return undefined;
}

export function toToolChoiceParam(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined
): ChatCompletionToolChoiceOption {
  return forceToolCall && specifications.some((s) => s.name === forceToolCall)
    ? { type: "function", function: { name: forceToolCall } }
    : ("auto" as const);
}

export function toOutputFormatParam(
  responseFormat: string | null
): ResponseFormatJSONSchema | undefined {
  const responseFormatObject = parseResponseFormatSchema(responseFormat);
  if (!responseFormatObject) {
    return;
  }
  return {
    type: "json_schema",
    json_schema: { name: "", schema: responseFormatObject.json_schema.schema },
  };
}
