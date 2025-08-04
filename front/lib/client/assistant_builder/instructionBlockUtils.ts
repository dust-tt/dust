import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { NodeType } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/react";

/**
 * Regex pattern for matching XML-style instruction blocks
 */
export const INSTRUCTION_BLOCK_REGEX = /<(\w+)>([\s\S]*?)<\/\1>/g;

/**
 * Regex pattern for matching opening XML tags
 */
export const OPENING_TAG_REGEX = /<(\w+)>$/;

/**
 * Interface for parsed instruction block match
 */
export interface InstructionBlockMatch {
  fullMatch: string;
  type: string;
  content: string;
  start: number;
  end: number;
}

/**
 * Parse instruction block matches from text
 */
export function parseInstructionBlockMatches(
  text: string
): InstructionBlockMatch[] {
  const matches: InstructionBlockMatch[] = [];
  const regex = new RegExp(
    INSTRUCTION_BLOCK_REGEX.source,
    INSTRUCTION_BLOCK_REGEX.flags
  );
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      type: match[1].toLowerCase(),
      content: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Convert text content to paragraph JSONContent nodes
 */
export function textToParagraphNodes(content: string): JSONContent[] {
  const lines = content.split("\n");
  return lines.map((line) => ({
    type: "paragraph",
    content: line.trim() ? [{ type: "text", text: line.trim() }] : [],
  }));
}

/**
 * Convert text content to ProseMirror paragraph nodes
 */
export function textToProseMirrorParagraphs(
  content: string,
  schema: Schema
): ProseMirrorNode[] {
  const lines = content.split("\n");
  return lines.map((line) => {
    const trimmedLine = line.trim();
    return schema.nodes.paragraph.create(
      {},
      trimmedLine ? [schema.text(trimmedLine)] : []
    );
  });
}

/**
 * Create instruction block JSONContent
 */
export function createInstructionBlockNode(
  type: string,
  content: string
): JSONContent {
  const paragraphs = textToParagraphNodes(content);
  const blockContent =
    paragraphs.length > 0 ? paragraphs : [{ type: "paragraph", content: [] }];

  return {
    type: "instructionBlock",
    attrs: { type },
    content: blockContent,
  };
}

/**
 * Create ProseMirror instruction block node
 */
export function createProseMirrorInstructionBlock(
  type: string,
  content: string,
  nodeType: NodeType,
  schema: Schema
): ProseMirrorNode {
  const paragraphs = textToProseMirrorParagraphs(content, schema);
  const blockContent =
    paragraphs.length > 0 ? paragraphs : [schema.nodes.paragraph.create()];

  return nodeType.create({ type }, blockContent);
}

/**
 * Process text and split around instruction blocks
 */
export function splitTextAroundBlocks(text: string): Array<{
  type: "text" | "block";
  content: string;
  blockType?: string;
  start: number;
  end: number;
}> {
  const result: Array<{
    type: "text" | "block";
    content: string;
    blockType?: string;
    start: number;
    end: number;
  }> = [];

  const matches = parseInstructionBlockMatches(text);
  let lastIndex = 0;

  matches.forEach((match) => {
    // Add text before the block
    if (match.start > lastIndex) {
      const beforeText = text.slice(lastIndex, match.start).trim();
      if (beforeText) {
        result.push({
          type: "text",
          content: beforeText,
          start: lastIndex,
          end: match.start,
        });
      }
    }

    // Add the block
    result.push({
      type: "block",
      content: match.content,
      blockType: match.type,
      start: match.start,
      end: match.end,
    });

    lastIndex = match.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex).trim();
    if (remainingText) {
      result.push({
        type: "text",
        content: remainingText,
        start: lastIndex,
        end: text.length,
      });
    }
  }

  return result;
}
