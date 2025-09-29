import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import type { NodeType } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/react";

/**
 * Tag name pattern (XML-like, simplified): start with letter/_ then [A-Za-z0-9._:-]*
 */
const TAG_NAME_PATTERN = "[A-Za-z_][A-Za-z0-9._:-]*";

/**
 * Regex pattern for matching XML-style instruction blocks
 */
const INSTRUCTION_BLOCK_REGEX = new RegExp(
  `<(${TAG_NAME_PATTERN})>([\\s\\S]*?)<\\/\\1>`,
  "g"
);

/**
 * Regex pattern for matching opening/closing XML tags (including empty <> when typing).
 */
export const OPENING_TAG_REGEX = new RegExp(`<(${TAG_NAME_PATTERN})?>$`);
export const CLOSING_TAG_REGEX = new RegExp(`^</(${TAG_NAME_PATTERN})?>$`);

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
function parseInstructionBlockMatches(text: string): InstructionBlockMatch[] {
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
function textToParagraphNodes(content: string): JSONContent[] {
  const lines = content.split("\n");
  return lines.map((line) => ({
    type: "paragraph",
    content: line.trim() ? [{ type: "text", text: line.trim() }] : [],
  }));
}

/**
 * Convert text content to block nodes (paragraphs, headings, and code blocks)
 */
export function textToBlockNodes(content: string): JSONContent[] {
  const nodes: JSONContent[] = [];

  for (const segment of splitContentByCodeFences(content)) {
    if (segment.type === "code") {
      const language = extractLanguageFromInfo(segment.info);
      nodes.push({
        type: "codeBlock",
        attrs: { language },
        content: segment.content
          ? [{ type: "text", text: segment.content }]
          : [],
      });
      continue;
    }

    const lines = segment.content.split("\n");
    let lastWasEmpty = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) {
        // Only emit an empty paragraph if between content and not consecutive
        const isNotFirst = i > 0;
        const isNotLast = i < lines.length - 1;
        const prevLineHasContent = i > 0 && lines[i - 1].trim();
        const nextLineHasContent = i < lines.length - 1 && lines[i + 1].trim();
        if (
          isNotFirst &&
          isNotLast &&
          (prevLineHasContent || nextLineHasContent) &&
          !lastWasEmpty
        ) {
          nodes.push({ type: "paragraph", content: [] });
          lastWasEmpty = true;
        }
        continue;
      }

      lastWasEmpty = false;
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingContent = headingMatch[2].trim();
        nodes.push({
          type: "heading",
          attrs: { level },
          content: headingContent
            ? [{ type: "text", text: headingContent }]
            : [],
        });
      } else {
        nodes.push({
          type: "paragraph",
          content: [{ type: "text", text: line }],
        });
      }
    }
  }

  return nodes;
}

/**
 * Convert text content to ProseMirror paragraph nodes
 */
function textToProseMirrorParagraphs(
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
 * Convert text content to ProseMirror block nodes (paragraphs, headings, and code blocks)
 */
function textToProseMirrorBlocks(
  content: string,
  schema: Schema
): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];

  for (const segment of splitContentByCodeFences(content)) {
    if (segment.type === "code") {
      if (schema.nodes.codeBlock) {
        const language = extractLanguageFromInfo(segment.info);
        nodes.push(
          schema.nodes.codeBlock.create(
            { language },
            segment.content ? [schema.text(segment.content)] : []
          )
        );
      }
      continue;
    }

    const lines = segment.content.split("\n");
    let lastWasEmpty = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) {
        const isNotFirst = i > 0;
        const isNotLast = i < lines.length - 1;
        const prevLineHasContent = i > 0 && lines[i - 1].trim();
        const nextLineHasContent = i < lines.length - 1 && lines[i + 1].trim();
        if (
          isNotFirst &&
          isNotLast &&
          (prevLineHasContent || nextLineHasContent) &&
          !lastWasEmpty
        ) {
          nodes.push(schema.nodes.paragraph.create());
          lastWasEmpty = true;
        }
        continue;
      }

      lastWasEmpty = false;
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch && schema.nodes.heading) {
        const level = headingMatch[1].length;
        const headingContent = headingMatch[2].trim();
        nodes.push(
          schema.nodes.heading.create(
            { level },
            headingContent ? [schema.text(headingContent)] : []
          )
        );
      } else {
        nodes.push(schema.nodes.paragraph.create({}, [schema.text(line)]));
      }
    }
  }

  return nodes;
}

/**
 * Create instruction block JSONContent
 */
export function createInstructionBlockNode(
  type: string,
  content: string
): JSONContent {
  const blocks = textToBlockNodes(content);

  // Add opening and closing tags as paragraphs
  const blockContent: JSONContent[] = [
    {
      type: "paragraph",
      content: [{ type: "text", text: `<${type}>` }],
    },
    ...(blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }]),
    {
      type: "paragraph",
      content: [{ type: "text", text: `</${type}>` }],
    },
  ];

  return {
    type: "instructionBlock",
    attrs: { type },
    content: blockContent,
  };
}

/**
 * Split content into segments preserving fenced code blocks.
 * Supports info strings and languages with symbols (e.g., c++, objective-c).
 */
function splitContentByCodeFences(
  content: string
): Array<{ type: "code" | "text"; content: string; info?: string }> {
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  const segments: Array<{
    type: "code" | "text";
    content: string;
    info?: string;
  }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }
    let codeContent = match[2];
    if (codeContent && codeContent.endsWith("\n")) {
      codeContent = codeContent.slice(0, -1);
    }
    segments.push({ type: "code", info: match[1] || "", content: codeContent });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }

  return segments;
}

/** Extract first token (language) from a fenced code info string. */
function extractLanguageFromInfo(info?: string): string {
  if (typeof info !== "string") {
    return "";
  }
  const trimmed = info.trim();
  if (!trimmed) {
    return "";
  }
  const [language] = trimmed.split(/\s+/);
  return language || "";
}

/**
 * Create ProseMirror instruction block node
 */
function createProseMirrorInstructionBlock(
  type: string,
  content: string,
  nodeType: NodeType,
  schema: Schema
): ProseMirrorNode {
  const blocks = textToProseMirrorBlocks(content, schema);

  // Add opening and closing tags as paragraphs
  const blockContent = [
    schema.nodes.paragraph.create({}, [schema.text(`<${type}>`)]),
    ...(blocks.length > 0 ? blocks : [schema.nodes.paragraph.create()]),
    schema.nodes.paragraph.create({}, [schema.text(`</${type}>`)]),
  ];

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
