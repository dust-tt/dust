import type { JSONContent } from "@tiptap/react";
import {
  parseInstructionBlockMatches,
  createInstructionBlockNode,
  textToParagraphNodes,
  splitTextAroundBlocks,
} from "@app/lib/client/assistant_builder/instructionBlockUtils";

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
  const segments = splitTextAroundBlocks(text);

  segments.forEach((segment) => {
    if (segment.type === 'text') {
      // Add text as paragraphs
      const paragraphs = textToParagraphNodes(segment.content);
      content.push(...paragraphs);
    } else if (segment.type === 'block' && segment.blockType) {
      // Add instruction block
      const blockNode = createInstructionBlockNode(segment.blockType, segment.content);
      content.push(blockNode);
    }
  });

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
