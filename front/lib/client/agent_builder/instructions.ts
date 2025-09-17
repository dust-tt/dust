import type { JSONContent } from "@tiptap/react";

import {
  createInstructionBlockNode,
  splitTextAroundBlocks,
  textToBlockNodes,
} from "@app/lib/client/agent_builder/instructionBlockUtils";

function serializeNodeToText(node: JSONContent): string {
  if (node.type === "heading") {
    // Preserve the original heading level in markdown (support H1–H6)
    const level = node.attrs?.level || 1;
    const safeLevel = Math.max(1, Math.min(level, 6));
    const prefix = "#".repeat(safeLevel) + " ";
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const content = node.content?.map(serializeNodeToText).join("") || "";
    return `${prefix}${content}\n`;
  }

  if (node.type === "paragraph") {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const text = node.content?.map(serializeNodeToText).join("") || "";
    return `${text}\n`;
  }

  if (node.type === "text") {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return node.text || "";
  }

  if (node.type === "codeBlock") {
    // Convert code blocks to markdown format with triple backticks
    const language = node.attrs?.language || "";
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const code = node.content?.map(serializeNodeToText).join("") || "";
    // Code blocks should have exactly one newline before the closing backticks
    return `\`\`\`${language}\n${code}\n\`\`\`\n`;
  }

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
    if (segment.type === "text") {
      const nodes = textToBlockNodes(segment.content);
      content.push(...nodes);
    } else if (segment.type === "block" && segment.blockType) {
      const blockNode = createInstructionBlockNode(
        segment.blockType,
        segment.content
      );
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
