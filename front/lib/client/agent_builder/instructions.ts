import type { JSONContent } from "@tiptap/react";

import {
  createInstructionBlockNode,
  splitTextAroundBlocks,
} from "@app/lib/client/agent_builder/instructionBlockUtils";

function serializeNodeToText(node: JSONContent): string {
  if (node.type === "instructionBlock") {
    const content = node.content?.map(serializeNodeToText).join("") || "";
    return content;
  }

  if (node.type === "heading") {
    // Preserve the original heading level in markdown (support H1–H6)
    const level = node.attrs?.level || 1;
    const safeLevel = Math.max(1, Math.min(level, 6));
    const prefix = "#".repeat(safeLevel) + " ";
    const content = node.content?.map(serializeNodeToText).join("") || "";
    return `${prefix}${content}\n`;
  }

  if (node.type === "paragraph") {
    if (!node.content || !node.content.length) {
      return "\n";
    }

    if (node.content.length === 1 && node.content[0].type === "text") {
      return `${node.content[0].text}\n`;
    }

    const text = node.content.map(serializeNodeToText).join("");
    return text ? `${text}\n` : "\n";
  }

  if (node.type === "text") {
    return node.text || "";
  }

  if (node.type === "codeBlock") {
    // Convert code blocks to markdown format with triple backticks
    const language = node.attrs?.language || "";
    const code = node.content?.map(serializeNodeToText).join("") || "";
    return `\`\`\`${language}\n${code}\`\`\`\n`;
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
      // Parse code blocks from the text
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
      let lastIndex = 0;
      let match;

      while ((match = codeBlockRegex.exec(segment.content)) !== null) {
        if (match.index > lastIndex) {
          const textBefore = segment.content.slice(lastIndex, match.index);
          const nodes = parseTextWithHeadings(textBefore);
          content.push(...nodes);
        }
        const language = match[1] || "";
        const code = match[2];
        content.push({
          type: "codeBlock",
          attrs: { language },
          content: code ? [{ type: "text", text: code }] : [],
        });

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < segment.content.length) {
        const remainingText = segment.content.slice(lastIndex);
        const nodes = parseTextWithHeadings(remainingText);
        content.push(...nodes);
      }
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

function parseTextWithHeadings(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Check for markdown headings and preserve their levels (H1–H6)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length; // Preserve original level (1–6)
      const content = headingMatch[2].trim();
      nodes.push({
        type: "heading",
        attrs: { level }, // Keep the original heading level
        content: content ? [{ type: "text", text: content }] : [],
      });
    } else {
      // Regular paragraph
      nodes.push({
        type: "paragraph",
        content: line.trim() ? [{ type: "text", text: line.trim() }] : [],
      });
    }
  }

  return nodes;
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
