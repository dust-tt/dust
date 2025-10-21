import type {
  ResponseInput,
  ResponseInputContent,
  ResponseInputItem,
  ResponseInputMessageContentList,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";

import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment as Message,
  UserMessageTypeModel,
} from "@app/types";
import type {
  AgentReasoningEffort,
  ModelConversationTypeMultiActions,
} from "@app/types";
import { isString } from "@app/types";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

export function toOpenAIReasoningEffort(
  reasoningEffort: AgentReasoningEffort
): ReasoningEffort | null {
  return reasoningEffort === "none"
    ? null
    : reasoningEffort === "light"
      ? "low"
      : reasoningEffort;
}

function contentToResponseInputContent(content: Content): ResponseInputContent {
  switch (content.type) {
    case "text":
      return { type: "input_text", text: content.text };
    case "image_url":
      return {
        type: "input_image",
        image_url: content.image_url.url,
        detail: "auto",
      };
  }
}

function agentContentToResponseInputContent(
  content: AgentContentItemType
): ResponseInputItem {
  switch (content.type) {
    case "text_content":
      return {
        role: "assistant",
        type: "message",
        content: content.value,
      };
    case "function_call":
      return {
        type: "function_call",
        call_id: content.value.id,
        name: content.value.name,
        arguments: content.value.arguments,
      };
    case "reasoning":
      return {
        id: "",
        type: "reasoning",
        summary: [
          { type: "summary_text", text: content.value.reasoning ?? "" },
        ],
      };
    case "error":
      return {
        role: "assistant",
        type: "message",
        content: content.value.message,
      };
  }
}

function contentListToResponseInputContentList(
  content: Content[]
): ResponseInputContent[] {
  return content.map(contentToResponseInputContent);
}

function messageContentToResponseInputMessageContentList(
  content?: string | Content[]
): ResponseInputMessageContentList {
  if (!content) {
    return [];
  }
  if (isString(content)) {
    return [{ type: "input_text", text: content }];
  }
  return contentListToResponseInputContentList(content);
}

function systemPrompt(prompt: string): ResponseInputItem.Message {
  return {
    role: "developer",
    content: [{ type: "input_text", text: prompt }],
  };
}

function userMessage(message: UserMessageTypeModel): ResponseInputItem.Message {
  return {
    role: "user",
    content: messageContentToResponseInputMessageContentList(message.content),
  };
}

function assistantMessage(
  message:
    | AssistantContentMessageTypeModel
    | AssistantFunctionCallMessageTypeModel
): ResponseInputItem[] {
  if (message.contents) {
    return message.contents.map(agentContentToResponseInputContent);
  } else {
    return [];
  }
}

function functionMessage(
  message: FunctionMessageTypeModel
): ResponseInputItem[] {
  const outputString = isString(message.content)
    ? message.content
    : message.content.map((content) => JSON.stringify(content)).join("\n");
  return [
    {
      type: "function_call_output",
      call_id: message.function_call_id,
      output: outputString,
    },
  ];
}

function messageToResponseInputItems(message: Message): ResponseInputItem[] {
  switch (message.role) {
    case "user":
      return [userMessage(message)];
    case "assistant":
      return assistantMessage(message);
    case "function":
      return functionMessage(message);
  }
}

export function toInput(
  prompt: string,
  conversation: ModelConversationTypeMultiActions
): ResponseInput {
  const inputs: ResponseInput = [];
  inputs.push(systemPrompt(prompt));

  for (const message of conversation.messages) {
    inputs.push(...messageToResponseInputItems(message));
  }
  return inputs;
}
