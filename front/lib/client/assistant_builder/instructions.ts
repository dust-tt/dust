import type { JSONContent } from "@tiptap/react";

export function plainTextFromTipTapContent(root: JSONContent): string {
  if (root.type !== "doc" || !root.content) {
    return "";
  }

  return root.content.reduce((acc, p) => {
    // Ignore non-paragraph nodes
    if (p.type !== "paragraph") {
      return acc;
    }

    // Empty paragraphs or paragraphs with multiple nodes are treated as newlines.
    if (!p.content || !p.content.length || p.content.length > 1) {
      return acc + "\n";
    }

    // Only paragraphs with a single text node are considered.
    const textNode = p.content && p.content[0];
    if (textNode.type !== "text") {
      return acc;
    }

    return acc + `${textNode.text}\n`;
  }, "");
}

export function tipTapContentFromPlainText(text: string): JSONContent {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((l) => ({
      type: "paragraph",
      content: l ? [{ type: "text", text: l }] : [],
    })),
  };
}
