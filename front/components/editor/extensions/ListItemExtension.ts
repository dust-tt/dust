import type { JSONContent } from "@tiptap/core";
import { ListItem } from "@tiptap/extension-list-item";

function isInlineNode(node: JSONContent): boolean {
  return node.type === "text" || !node.type;
}

/**
 * Wraps any inline (non-block) nodes in paragraphs so the result only contains
 * block-level nodes, as required by the listItem schema ("paragraph block*").
 */
function ensureBlockContent(content: JSONContent[]): JSONContent[] {
  const result: JSONContent[] = [];
  let pendingInline: JSONContent[] = [];

  const flushInline = () => {
    if (pendingInline.length > 0) {
      result.push({ type: "paragraph", content: pendingInline });
      pendingInline = [];
    }
  };

  for (const node of content) {
    if (isInlineNode(node)) {
      pendingInline.push(node);
    } else {
      flushInline();
      result.push(node);
    }
  }
  flushInline();

  // Schema requires at least one leading paragraph.
  if (result.length === 0 || result[0].type !== "paragraph") {
    result.unshift({ type: "paragraph", content: [] });
  }

  return result;
}

// Capture the original parseMarkdown from the base ListItem extension.
const originalParseMarkdown = ListItem.config.parseMarkdown;

/**
 * Extends the default ListItem to fix schema violations when parsing markdown
 * with same-line nested list markers (e.g. "- - text" or "- 1. text").
 *
 * The marked tokenizer interprets these as nested lists, producing a listItem
 * whose content starts with a bulletList/orderedList instead of a paragraph,
 * or contains loose text nodes that aren't wrapped in paragraphs.
 * This violates the listItem schema ("paragraph block*") and crashes
 * ProseMirror with: "Invalid content for node listItem".
 *
 * Fix: delegate to the original parseMarkdown, then post-process the result
 * to ensure content always starts with a paragraph and that all inline nodes
 * are wrapped in paragraphs.
 */
export const ListItemExtension = ListItem.extend({
  parseMarkdown: (token, helpers) => {
    if (!originalParseMarkdown) {
      return [];
    }

    const result = originalParseMarkdown(token, helpers);

    // The original returns { type: "listItem", content: [...] } or [] for
    // non-list_item tokens.
    if (!Array.isArray(result) && "type" in result && result.content) {
      result.content = ensureBlockContent(result.content);
    }

    return result;
  },
});
