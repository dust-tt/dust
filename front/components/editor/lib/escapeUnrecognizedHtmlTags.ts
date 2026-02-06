import type { Schema, TagParseRule } from "@tiptap/pm/model";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";

/**
 * Workaround for tiptap/markdown #7256: escape <WORD> tokens that the schema
 * doesn't recognize as HTML, preventing block-in-inline schema violations.
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

  return markdown.replace(/<([A-Za-z][A-Za-z0-9]*)>/g, (match, tag) => {
    if (recognized.has(tag.toLowerCase())) {
      return match;
    }
    // Use HTML entities so `marked` treats them as literal text, not as an
    // HTML tag (which would cause the block-in-inline schema violation).
    return `&lt;${tag}&gt;`;
  });
}
