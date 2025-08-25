import type { JSONContent } from "@tiptap/react";

import {
  createInstructionBlockNode,
  splitTextAroundBlocks,
  textToParagraphNodes,
} from "@app/lib/client/agent_builder/instructionBlockUtils";

function serializeNodeToText(node: JSONContent): string {
  if (node.type === "instructionBlock") {
    // Just serialize the content as-is since tags are now part of the content
    const content = node.content?.map(serializeNodeToText).join("") || "";
    return content;
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

  if (node.type === "codeBlock") {
    // Convert code blocks to markdown format with triple backticks
    const language = node.attrs?.language || "";
    const code = node.content?.map(serializeNodeToText).join("") || "";
    return `\`\`\`${language}\n${code}\`\`\`\n`;
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
    if (segment.type === "text") {
      // Parse code blocks from the text
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
      let lastIndex = 0;
      let match;

      while ((match = codeBlockRegex.exec(segment.content)) !== null) {
        // Add text before code block as paragraphs
        if (match.index > lastIndex) {
          const textBefore = segment.content.slice(lastIndex, match.index);
          const paragraphs = textToParagraphNodes(textBefore);
          content.push(...paragraphs);
        }

        // Add code block
        const language = match[1] || "";
        const code = match[2];
        content.push({
          type: "codeBlock",
          attrs: { language },
          content: code ? [{ type: "text", text: code }] : [],
        });

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text after last code block
      if (lastIndex < segment.content.length) {
        const remainingText = segment.content.slice(lastIndex);
        const paragraphs = textToParagraphNodes(remainingText);
        content.push(...paragraphs);
      }
    } else if (segment.type === "block" && segment.blockType) {
      // Add instruction block
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
