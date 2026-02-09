import type { Schema, TagParseRule } from "@tiptap/pm/model";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";

import { TAG_NAME_PATTERN } from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";

/**
 * Workaround for tiptap/markdown #7256: handles unrecognized HTML-like tags to prevent
 * block-in-inline schema violations.
 *
 * Behavior:
 * - Recognized HTML tags (e.g. <p>, <code>) are left untouched
 * - Instruction blocks with matching tags (e.g. <abc>xyz</abc>) are preserved as instruction blocks
 * - Orphan tags without matching pairs (e.g. <foo>) are wrapped in HTML spans with entities
 *
 * Examples:
 * - "<abc>content</abc>" → "<abc>content</abc>" (preserved as instruction block)
 * - "test <foo>" → "test <span>&lt;foo&gt;</span>" (markdown) → "<p>test <span>&lt;foo&gt;</span></p>" (HTML) → "test <foo>" (rendered)
 * - "<p>text</p>" → "<p>text</p>" (recognized HTML, left untouched)
 *
 * TODO: Remove when tiptap merges https://github.com/ueberdosis/tiptap/pull/7260
 */
export function escapeUnrecognizedHtmlTags(
  markdown: string,
  schema: Schema
): string {
  const recognized = new Set(
    PMDOMParser.fromSchema(schema)
      .rules.filter((r): r is TagParseRule => "tag" in r)
      .map((r) => r.tag.match(/^([a-z][a-z0-9]*)/i)?.[1]?.toLowerCase())
      .filter(Boolean)
  );

  // Create a global regex for matching instruction blocks (without ^ anchor)
  // Matches: <tagName>content</tagName> where tagName follows TAG_NAME_PATTERN
  const instructionBlockRegex = new RegExp(
    `<(${TAG_NAME_PATTERN})>([\\s\\S]*?)</\\1>`,
    "gi"
  );

  // First, protect instruction blocks by temporarily replacing them with placeholders
  const instructionBlocks: string[] = [];
  let markdownWithPlaceholders = markdown.replace(
    instructionBlockRegex,
    (match) => {
      const placeholder = `__INSTRUCTION_BLOCK_${instructionBlocks.length}__`;
      instructionBlocks.push(match);
      return placeholder;
    }
  );

  // Now escape orphan unrecognized HTML-like tags (but not instruction blocks)
  markdownWithPlaceholders = markdownWithPlaceholders.replace(
    /<\/?([A-Za-z][A-Za-z0-9]*)>/g,
    (match, tag) => {
      if (recognized.has(tag.toLowerCase())) {
        return match;
      }

      // Use inline HTML span with HTML entities to preserve the tag display
      // This allows markdown parser to pass through the HTML, which will render as plain text
      // <foo> becomes <span>&lt;foo&gt;</span> which displays as <foo>
      return `<span>${match.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;
    }
  );

  // Restore instruction blocks
  instructionBlocks.forEach((block, index) => {
    const placeholder = `__INSTRUCTION_BLOCK_${index}__`;
    markdownWithPlaceholders = markdownWithPlaceholders.replace(
      placeholder,
      block
    );
  });

  return markdownWithPlaceholders;
}
