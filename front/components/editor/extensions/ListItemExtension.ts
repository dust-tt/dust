/**
 * Custom ListItem extension that respects parent OrderedList's start attribute.
 *
 * The default TipTap ListItem extension always uses `context.index + 1` for
 * numbered lists, which always starts from 1. This extension checks for
 * `orderedListStart` in context.meta (set by OrderedListExtension) and
 * calculates the correct number.
 *
 * Works in conjunction with OrderedListExtension to preserve numbering.
 */

import type { JSONContent } from "@tiptap/core";
import { renderNestedMarkdownContent } from "@tiptap/core";
import { ListItem } from "@tiptap/extension-list-item";

export const ListItemExtension = ListItem.extend({
  /**
   * Override markdown rendering to use parent's start attribute.
   *
   * When rendering list items in an ordered list, check if the parent
   * passed a custom start value via context.meta.orderedListStart.
   * If so, add that to the index to get the correct number.
   */
  renderMarkdown: (node: JSONContent, helpers: any, context: any) => {
    return renderNestedMarkdownContent(
      node,
      helpers,
      (ctx: any) => {
        if (ctx.parentType === "bulletList") {
          return "- ";
        }
        if (ctx.parentType === "orderedList") {
          // Check if parent OrderedList provided a start value
          const orderedListStart = ctx.meta?.orderedListStart ?? 1;

          // Calculate the correct number: parent's start + our index
          const itemNumber = orderedListStart + ctx.index;

          return `${itemNumber}. `;
        }
        // Fallback for unknown parent types
        return "- ";
      },
      context
    );
  },
});
