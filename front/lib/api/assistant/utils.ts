import type { ModelMessageTypeMultiActions } from "@app/types";
import { isTextContent } from "@app/types";

export function getTextContentFromMessage(
  message: ModelMessageTypeMultiActions
): string {
  const { content } = message;

  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    ?.map((c) => {
      if (isTextContent(c)) {
        return c.text;
      }

      return c.image_url.url;
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
