/**
 * Custom OrderedList extension that preserves start attribute in markdown.
 *
 * The default TipTap OrderedList extension correctly parses and stores the
 * `start` attribute, but when serializing to markdown, it delegates to
 * ListItem which always starts numbering from 1. This extension overrides
 * renderMarkdown to manually render each list item with the correct number
 * based on the start attribute.
 */

import type { JSONContent } from "@tiptap/core";
import { OrderedList } from "@tiptap/extension-ordered-list";

export const OrderedListExtension = OrderedList.extend({
  /**
   * Override markdown rendering to use start attribute for numbering.
   *
   * Instead of delegating to ListItem (which would always start from 1),
   * we manually render each list item with the correct number based on
   * the start attribute plus the item's index.
   */
  renderMarkdown: (node: JSONContent, helpers: any, _context: any) => {
    if (!node.content || !Array.isArray(node.content)) {
      return "";
    }

    // Get the start attribute from the node (defaults to 1)
    const start = node.attrs?.start ?? 1;

    // Manually render each list item with the correct numbering
    // We can't use helpers.renderChildren because it doesn't let us pass custom context
    const lines: string[] = [];

    node.content.forEach((listItem, index) => {
      const itemNumber = start + index;

      // Render the list item's content (usually paragraphs)
      if (listItem.content && Array.isArray(listItem.content)) {
        const itemContent = helpers.renderChildren(listItem.content as any);
        lines.push(`${itemNumber}. ${itemContent}`);
      }
    });

    return lines.join("\n");
  },
});
