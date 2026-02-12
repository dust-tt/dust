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
 * won't parse HTML, except for matched block pairs at line start.
 *
 * Strategy: escape all `<` (skip if already followed by ZWS), add blank lines
 * around instruction tags, then un-escape only instruction blocks at line start.
 *
 * TODO: Remove when tiptap merges https://github.com/ueberdosis/tiptap/pull/7260
 */
export function preprocessMarkdownForEditor(markdown: string): string {
  const matchedPairs = collectMatchedTagNames(markdown);

  // Step 1: Escape `<` only when not already followed by ZWS (avoids double-escaping round-trips).
  const escapeRegex = new RegExp(`<(?!${ZWS})`, "g");
  let processed = markdown.replace(escapeRegex, `<${ZWS}`);

  // Step 2: Ensure blank lines around instruction block tags; preserve existing whitespace.
  const blankBeforeRegex = new RegExp(
    `(?<!\\n)\\n(<${ZWS}${TAG_NAME_PATTERN}>)`,
    "g"
  );
  const blankAfterRegex = new RegExp(
    `(<${ZWS}\\/${TAG_NAME_PATTERN}>)\\n(?!\\n)`,
    "g"
  );
  processed = processed.replace(blankBeforeRegex, "\n\n$1");
  processed = processed.replace(blankAfterRegex, "$1\n\n");

  // Step 3: Un-escape instruction block tags (remove ZWS) where they are preserved.
  const escapedTagRegex = new RegExp(
    `<${ZWS}(\\/?)(${TAG_NAME_PATTERN})([^>]*)>`,
    "gi"
  );
  const openCount = new Map<string, number>();

  processed = processed.replace(
    escapedTagRegex,
    (match, slash, tagName, rest, offset) => {
      const normalized = tagName.toLowerCase();
      const isClosing = slash === "/";

      if (isClosing) {
        const count = openCount.get(normalized) ?? 0;
        if (count > 0) {
          openCount.set(normalized, count - 1);
          return `<${slash}${tagName}${rest}>`;
        }
        return match;
      }

      const before = processed.substring(0, offset);
      const lineStart = before.lastIndexOf("\n") + 1;
      const textOnLine = before.substring(lineStart);
      const isAtLineStart = /^\s*$/.test(textOnLine);

      if (matchedPairs.has(normalized) && isAtLineStart) {
        openCount.set(normalized, (openCount.get(normalized) ?? 0) + 1);
        return `<${slash}${tagName}${rest}>`;
      }
      return match;
    }
  );

  return processed;
}
