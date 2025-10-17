import type { ModelMessageTypeMultiActions } from "@app/types";
import { isImageContent, isTextContent } from "@app/types";

export function getTextContentFromMessage(
  message: ModelMessageTypeMultiActions
): string {
  const { content } = message;

  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (isImageContent(content)) {
    return content.image_url.url;
  }

  return content
    ?.map((c) => {
      if (isTextContent(c)) {
        return c.text;
      }

      if (isImageContent(c)) {
        return c.image_url.url;
      }

      return "";
    })
    .join("\n");
}

// This function is used to get the text representation of the messages to calculate the token amount
export function getTextRepresentationFromMessages(
  messages: ModelMessageTypeMultiActions[]
): string[] {
  return [
    ...messages.map((m) => {
      let text = `${m.role} ${"name" in m ? m.name : ""} ${getTextContentFromMessage(m)}`;
      if ("function_calls" in m) {
        text += m.function_calls
          .map((f) => `${f.name} ${f.arguments}`)
          .join(" ");
      }
      return text;
    }),
  ];
}
