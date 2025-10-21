import type { Content as GoogleContent, Part } from "@google/genai";

import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment as Message,
} from "@app/types";
import { isString } from "@app/types";
import type { Content as DustContent } from "@app/types/assistant/generation";

function toGooglePart(content: DustContent): Part {
  switch (content.type) {
    case "text":
      return {
        text: content.text,
      };
    case "image_url":
      return {
        fileData: {
          fileUri: content.image_url.url,
          mimeType: "image/jpeg",
        },
      };
  }
}

function toGoogleParts(content: string | DustContent[]): Part[] {
  if (isString(content)) {
    return [{ text: content }];
  } else {
    return content.map(toGooglePart);
  }
}

function toGoogleContent(message: Message): GoogleContent {
  const role = message.role === "assistant" ? "model" : message.role;
  if (message.content) {
    return {
      role,
      parts: toGoogleParts(message.content),
    };
  } else {
    return {
      role,
      parts: [],
    };
  }
}

export function toHistory(conversation: ModelConversationTypeMultiActions): {
  history: GoogleContent[];
  lastMessage: string | Part[];
} {
  const len = conversation.messages.length;
  const lastContent = conversation.messages[len - 1].content;

  switch (len) {
    case 0:
      return {
        history: [],
        lastMessage: "",
      };
    case 1:
      if (lastContent) {
        return {
          history: [],
          lastMessage: toGoogleParts(lastContent),
        };
      } else {
        return {
          history: [],
          lastMessage: "",
        };
      }
    default:
      return {
        history: conversation.messages.slice(0, len - 1).map(toGoogleContent),
        lastMessage: lastContent ? toGoogleParts(lastContent) : "",
      };
  }
}
