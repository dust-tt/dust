import { TAG_NAME_PATTERN } from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";

/** Zero-width space to break HTML parsing without affecting display. */
const ZWS = "\u200B";

/**
 * Collects tag names that appear in matched instruction-block pairs (supports
 * nesting). Recurse into inner content to find nested pairs.
 */
function collectMatchedTagNames(str: string): Set<string> {
  const matched = new Set<string>();
  let m;
  const regex = new RegExp(`<(${TAG_NAME_PATTERN})>([\\s\\S]*?)<\\/\\1>`, "gi");
  while ((m = regex.exec(str)) !== null) {
    matched.add(m[1].toLowerCase());
    for (const tag of collectMatchedTagNames(m[2])) {
      matched.add(tag);
    }
  }
  return matched;
}

/**
 * Workaround for tiptap/markdown #7256: escape angle brackets so markdown-it
 * won't parse HTML, except for matched block pairs.
 *
 * Why this exists:
 *   markdown-it strips unrecognized HTML tags (e.g. <agent>, <rules>) from
 *   content before tiptap's custom tokenizer ever sees them. We insert a
 *   zero-width space (ZWS) after every `<` to break HTML parsing.
 *
 * Strategy (3 steps):
 *   1. Escape ALL `<` by inserting ZWS → nothing looks like HTML anymore.
 *   2. Normalize indentation so the tokenizer sees tags as block starts.
 *   3. Un-escape matched-pair tags that are at line start (block-level) or
 *      immediately after a parent/sibling tag we just un-escaped (nested blocks).
 *      Inline matched pairs (e.g. "text <do>this</do>") stay escaped.
 *
 * TODO: Remove when tiptap merges https://github.com/ueberdosis/tiptap/pull/7260
 */
export function preprocessMarkdownForEditor(markdown: string): string {
  const matchedPairs = collectMatchedTagNames(markdown);

  // Step 1: Escape `<` only when not already followed by ZWS (avoids double-escaping round-trips).
  let processed = markdown.replace(new RegExp(`<(?!${ZWS})`, "g"), `<${ZWS}`);

  // Step 2: Normalize indented block-level tags

  // 2a: Add \n\n before opening tags so marked treats them as separate blocks.
  processed = processed.replace(
    new RegExp(`(?<!\\n)\\n\\s*(<${ZWS}${TAG_NAME_PATTERN}>)`, "g"),
    "\n\n$1"
  );
  // 2b: Add \n\n before closing tags so they're seen as separate blocks.
  processed = processed.replace(
    new RegExp(`(?<!\\n)\\n\\s*(<${ZWS}\\/${TAG_NAME_PATTERN}>)`, "g"),
    "\n\n$1"
  );
  // 2c: Add \n\n after closing tags to generate block separation.
  processed = processed.replace(
    new RegExp(`(<${ZWS}\\/${TAG_NAME_PATTERN}>)\\s*\\n(?!\\n)`, "g"),
    "$1\n\n"
  );
  // 2d: Collapse newlines between a parent's > and the first child <tag>,
  // e.g. <agent>\n\n<bar> → <agent><bar>, so the tokenizer sees ^<tag> at content start.
  processed = processed.replace(
    new RegExp(`(?<!/)>\\n+\\s*(<${ZWS}${TAG_NAME_PATTERN}>)`, "gi"),
    ">$1"
  );

  // Step 3: Un-escape matched block-level tags.
  // Opening tags: un-escape if at line start OR immediately after a previously
  // un-escaped tag (parent opening or sibling closing — positions recorded from 2d collapse).
  // Closing tags: un-escape when they have a matching open (tracked via openCount).
  const escapedTagRegex = new RegExp(
    `<${ZWS}(\\/?)(${TAG_NAME_PATTERN})([^>]*)>`,
    "gi"
  );
  const openCount = new Map<string, number>();
  const validNestedPositions = new Set<number>();

  processed = processed.replace(
    escapedTagRegex,
    (match, slash, tagName, rest, offset) => {
      const normalized = tagName.toLowerCase();
      const isClosing = slash === "/";

      if (isClosing) {
        const count = openCount.get(normalized) ?? 0;
        if (count > 0) {
          openCount.set(normalized, count - 1);
          validNestedPositions.add(offset + match.length);
          return `<${slash}${tagName}${rest}>`;
        }
        return match;
      }

      const before = processed.substring(0, offset);
      const lineStart = before.lastIndexOf("\n") + 1;
      const textOnLine = before.substring(lineStart);
      const isAtLineStart = /^\s*$/.test(textOnLine);
      const isNestedChild = validNestedPositions.has(offset);

      if (matchedPairs.has(normalized) && (isAtLineStart || isNestedChild)) {
        openCount.set(normalized, (openCount.get(normalized) ?? 0) + 1);
        validNestedPositions.add(offset + match.length);
        return `<${slash}${tagName}${rest}>`;
      }
      return match;
    }
  );

  return processed;
}
