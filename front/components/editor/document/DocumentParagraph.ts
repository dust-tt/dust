import { escapeFrameEmbedLines } from "@app/lib/markdown/frame_embed";
import { Paragraph } from "@tiptap/extension-paragraph";

const renderParagraphMarkdown = Paragraph.config.renderMarkdown;

/**
 * @cc [owner:tdraier,label:product] document-paragraph-frame-text
 * A paragraph MUST write its Markdown through `escapeFrameEmbedLines`, so a line of its text that
 * reads as a `::frame` line, typed, pasted or left by a hard break, reopens as the same text and
 * never as a frame embed.
 */
export const DocumentParagraph = Paragraph.extend({
  renderMarkdown: (node, helpers, context) =>
    escapeFrameEmbedLines(
      renderParagraphMarkdown?.(node, helpers, context) ?? ""
    ),
});
