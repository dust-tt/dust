import type { ModelMessageTypeMultiActions } from "@dust-tt/types";
import { isTextContent } from "@dust-tt/types";

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
