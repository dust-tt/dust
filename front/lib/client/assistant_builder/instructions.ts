import { removeNulls } from "@dust-tt/types";
import type { JSONContent } from "@tiptap/react";

export function plainTextFromTipTapContent(root: JSONContent): string {
  if (root.type !== "doc" || !root.content) {
    return "";
  }
  let text = "";

  for (const p of root.content) {
    if (p.type !== "paragraph") {
      continue;
    }
    if (!p.content || !p.content.length || p.content.length > 1) {
      text += "\n";
      continue;
    }

    const textNode = p.content && p.content[0];
    if (textNode.type !== "text") {
      continue;
    }

    text += `${textNode.text}\n`;
  }

  return text;
}

export function tipTapContentFromPlainText(text: string): JSONContent {
  const lines = text.split("\n");
  const doc: JSONContent = {
    type: "doc",
    content: [],
  };
  for (const l of lines) {
    const textNode = l ? { type: "text", text: l } : undefined;
    const paragraph = { type: "paragraph", content: removeNulls([textNode]) };
    doc.content?.push(paragraph);
  }

  return doc;
}
