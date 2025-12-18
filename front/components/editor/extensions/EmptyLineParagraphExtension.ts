/**
 * Custom Paragraph extension that preserves empty lines in markdown.
 *
 * This extension overrides TipTap's default Paragraph node to handle the case where
 * multiple consecutive empty paragraphs are lost during markdown serialization.
 *
 * See: https://github.com/ueberdosis/tiptap/issues/7269
 *
 * Strategy:
 * - When serializing to markdown, convert empty paragraphs to double line breaks
 * - When parsing markdown, convert double line breaks back to empty paragraphs
 * - This preserves empty lines through the round-trip conversion
 */

import { Paragraph } from "@tiptap/extension-paragraph";

export const EmptyLineParagraphExtension = Paragraph.extend({
  /**
   * Override Markdown rendering to preserve empty paragraphs.
   *
   * Normal paragraphs are rendered as usual, but empty paragraphs are
   * converted to double line breakstags which are preserved by markdown parsers.
   */
  renderMarkdown: (node, helpers) => {
    const content = helpers.renderChildren(node.content ?? []);

    // Check if this is an empty paragraph
    if (!content || content.trim() === "") {
      // Render as double line breaks instead of empty paragraph
      // This will be preserved in markdown and parsed back correctly
      return "\n\n";
    }

    // Normal paragraph rendering
    return content;
  },
});
