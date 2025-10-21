import type {
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import type { Content, ModelConversationTypeMultiActions } from "@app/types";

function toAnthropicContent(
  input: Content[]
): (TextBlockParam | ImageBlockParam)[] {
  const content: (TextBlockParam | ImageBlockParam)[] = [];
  for (const contentItem of input) {
    switch (contentItem.type) {
      case "text":
        content.push({
          type: "text",
          text: contentItem.text,
        });
        break;
      case "image_url":
        content.push({
          type: "image",
          source: {
            type: "url",
            url: contentItem.image_url.url,
          },
        });
        break;
      default:
        continue;
    }
  }
  return content;
}

function userContentToMessageParam(content: string | Content[]): MessageParam {
  if (typeof content === "string") {
    return {
      role: "user" as const,
      content,
    };
  } else {
    return {
      role: "user" as const,
      content: toAnthropicContent(content),
    };
  }
}

function assistantContentToMessageParam(
  content: string | Content[]
): MessageParam {
  if (typeof content === "string") {
    return {
      role: "assistant" as const,
      content,
    };
  } else {
    return {
      role: "assistant" as const,
      content: toAnthropicContent(content),
    };
  }
}

function toolResultContentToMessageParam(
  tool_use_id: string,
  content: string | Content[]
): MessageParam {
  if (typeof content === "string") {
    return {
      role: "assistant" as const,
      content: [
        {
          type: "tool_result",
          tool_use_id,
          content,
        },
      ],
    };
  } else {
    return {
      role: "assistant" as const,
      content: [
        {
          type: "tool_result",
          tool_use_id,
          content: toAnthropicContent(content),
        },
      ],
    };
  }
}

export function toMessages(
  conversation: ModelConversationTypeMultiActions
): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const message of conversation.messages) {
    if (!message.content) {
      continue;
    }
    switch (message.role) {
      case "user":
        messages.push(userContentToMessageParam(message.content));
        break;
      case "assistant":
        messages.push(assistantContentToMessageParam(message.content));
        break;
      case "function":
        messages.push(
          toolResultContentToMessageParam(
            message.function_call_id,
            message.content
          )
        );
        break;
      default:
        continue;
    }
  }
  return messages;
}
