import type { JSONContent } from "@tiptap/react";

function serializeNodeToText(node: JSONContent): string {
  if (node.type === "instructionBlock") {
    const type = node.attrs?.type as string;
    const tagName = type?.toUpperCase() || "INFO";

    // Serialize content inside the block
    const content = node.content?.map(serializeNodeToText).join("") || "";

    return `<${tagName}>\n${content}</${tagName}>\n`;
  }

  if (node.type === "paragraph") {
    if (!node.content || !node.content.length) {
      return "\n";
    }

    if (node.content.length === 1 && node.content[0].type === "text") {
      return `${node.content[0].text}\n`;
    }

    // Handle multiple nodes in paragraph
    const text = node.content.map(serializeNodeToText).join("");
    return text ? `${text}\n` : "\n";
  }

  if (node.type === "text") {
    return node.text || "";
  }

  // Handle other node types by recursing into their content
  if (node.content) {
    return node.content.map(serializeNodeToText).join("");
  }

  return "";
}

export function plainTextFromTipTapContent(root: JSONContent): string {
  if (root.type !== "doc" || !root.content) {
    return "";
  }

  return root.content.map(serializeNodeToText).join("");
}

function parseInstructionBlocks(text: string): JSONContent[] {
  const content: JSONContent[] = [];
  const instructionBlockRegex = /<(INFO|APPROACH|TOOLS)>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let match;

  while ((match = instructionBlockRegex.exec(text)) !== null) {
    // Add content before the instruction block as regular paragraphs
    const beforeBlock = text.slice(lastIndex, match.index).trim();
    if (beforeBlock) {
      const lines = beforeBlock.split("\n");
      content.push(
        ...lines.map((l) => ({
          type: "paragraph",
          content: l.trim() ? [{ type: "text", text: l.trim() }] : [],
        }))
      );
    }

    // Add the instruction block
    const type = match[1].toLowerCase() as "info" | "approach" | "tools";
    const blockContent = match[2].trim();

    // Parse content inside the block as paragraphs
    const blockLines = blockContent.split("\n");
    const blockParagraphs = blockLines.map((l) => ({
      type: "paragraph",
      content: l.trim() ? [{ type: "text", text: l.trim() }] : [],
    }));

    content.push({
      type: "instructionBlock",
      attrs: { type },
      content:
        blockParagraphs.length > 0
          ? blockParagraphs
          : [{ type: "paragraph", content: [] }],
    });

    lastIndex = instructionBlockRegex.lastIndex;
  }

  // Add remaining content as regular paragraphs
  const remainingText = text.slice(lastIndex).trim();
  if (remainingText) {
    const lines = remainingText.split("\n");
    content.push(
      ...lines.map((l) => ({
        type: "paragraph",
        content: l.trim() ? [{ type: "text", text: l.trim() }] : [],
      }))
    );
  }

  return content;
}

export function tipTapContentFromPlainText(text: string): JSONContent {
  if (!text.trim()) {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    };
  }

  const content = parseInstructionBlocks(text);

  return {
    type: "doc",
    content:
      content.length > 0 ? content : [{ type: "paragraph", content: [] }],
  };
}
