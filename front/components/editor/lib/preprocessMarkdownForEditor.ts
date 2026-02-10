import type { Schema, TagParseRule } from "@tiptap/pm/model";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";

import { TAG_NAME_PATTERN } from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";

/**
 * Workaround for tiptap/markdown #7256: strip angle brackets from <WORD> tokens
 * that the schema doesn't recognize as HTML, preventing block-in-inline schema
 * violations. Recognized tags (e.g. <p>, <code>) are left untouched.
 *
 * TODO: Remove when tiptap merges https://github.com/ueberdosis/tiptap/pull/7260
 */
export function preprocessMarkdownForEditor(
  markdown: string,
  schema: Schema
): string {
  const recognized = new Set(
    PMDOMParser.fromSchema(schema)
      .rules.filter((r): r is TagParseRule => "tag" in r)
      .map((r) => r.tag.match(/^([a-z_][a-z0-9._:-]*)/i)?.[1]?.toLowerCase())
      .filter(Boolean)
  );

  // Build set of matched tag pairs (instruction blocks).
  const matchedPairs = new Set<string>();
  const pairRegex = new RegExp(
    `<(${TAG_NAME_PATTERN})>[\\s\\S]*?<\\/\\1>`,
    "g"
  );

  let pairMatch;
  while ((pairMatch = pairRegex.exec(markdown)) !== null) {
    matchedPairs.add(pairMatch[1].toLowerCase());
  }

  // 1. Ensure blank lines around instruction block tags.
  let processed = markdown;
  processed = processed.replace(
    new RegExp(`(?<!\\n)\\n(<${TAG_NAME_PATTERN}>)`, "g"),
    "\n\n$1"
  );
  processed = processed.replace(
    new RegExp(`(<\\/${TAG_NAME_PATTERN}>)\\n(?!\\n)`, "g"),
    "$1\n\n"
  );
  // 2. Escape all angle-bracket patterns that markdown-it would parse as HTML.
  //    Matches any `<` followed by optional `/` and a tag name (which is how
  //    markdown-it detects HTML), with optional trailing content (attributes,
  //    spaces, commas, etc.) up to `>`. Preserves recognized schema tags and
  //    matched instruction-block pairs.
  processed = processed.replace(
    new RegExp(`<(\\/?)(${TAG_NAME_PATTERN})([^>]*)>`, "g"),
    (match, slash, tagName, rest) => {
      const normalized = tagName.toLowerCase();
      if (recognized.has(normalized) || matchedPairs.has(normalized)) {
        return match;
      }
      return `${slash}${tagName}${rest}`;
    }
  );

  return processed;
}
