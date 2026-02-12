import { TAG_NAME_PATTERN } from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";

/**
 * Workaround for tiptap/markdown #7256: escape angle brackets from <WORD> tokens
 * that markdown-it would parse as HTML, except for matched instruction-block pairs.
 *
 * TODO: Remove when tiptap merges https://github.com/ueberdosis/tiptap/pull/7260
 */
export function preprocessMarkdownForEditor(markdown: string): string {
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
  //    Preserves only matched pairs where the opening tag is at start of line.
  // Use a counter per tag to support nested/sequential same-tag blocks.
  const openPreservedCount = new Map<string, number>();
  processed = processed.replace(
    new RegExp(`<(\\/?)(${TAG_NAME_PATTERN})([^>]*)>`, "g"),
    (match, slash, tagName, rest, offset) => {
      const normalized = tagName.toLowerCase();
      const isClosing = slash === "/";

      if (isClosing) {
        const count = openPreservedCount.get(normalized) ?? 0;
        if (count > 0) {
          openPreservedCount.set(normalized, count - 1);
          return match;
        }
        return `<\u200B${slash}${tagName}${rest}>`;
      }

      // Opening: preserve only if in matched pair and at start of line
      const beforeMatch = processed.substring(0, offset);
      const lastNewlineIndex = beforeMatch.lastIndexOf("\n");
      const textOnSameLine = beforeMatch.substring(lastNewlineIndex + 1);
      const isAtStartOfLine = /^\s*$/.test(textOnSameLine);

      if (matchedPairs.has(normalized) && isAtStartOfLine) {
        openPreservedCount.set(
          normalized,
          (openPreservedCount.get(normalized) ?? 0) + 1
        );
        return match;
      }
      return `<\u200B${slash}${tagName}${rest}>`;
    }
  );
  return processed;
}
