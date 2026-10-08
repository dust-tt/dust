import type { Node as PMNode } from "@tiptap/pm/model";
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from "@tiptap/pm/markdown";

// Markdown <-> editor for the document panel. Parsing goes through HTML (the
// editor reads HTML natively); serializing maps Tiptap's node names onto
// prosemirror-markdown's default serializer, which uses snake_case names.

const nodes = defaultMarkdownSerializer.nodes;
const marks = defaultMarkdownSerializer.marks;

const serializer = new MarkdownSerializer(
  {
    paragraph: nodes.paragraph,
    heading: nodes.heading,
    blockquote: nodes.blockquote,
    horizontalRule: nodes.horizontal_rule,
    bulletList: nodes.bullet_list,
    listItem: nodes.list_item,
    hardBreak: nodes.hard_break,
    text: nodes.text,
    image: nodes.image,
    orderedList(state, node) {
      const start: number = node.attrs.start ?? 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const indent = state.repeat(" ", maxWidth + 2);
      state.renderList(node, indent, (i) => {
        const label = String(start + i);
        return state.repeat(" ", maxWidth - label.length) + label + ". ";
      });
    },
    codeBlock(state, node) {
      const fence = "```";
      state.write(fence + (node.attrs.language ?? "") + "\n");
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write(fence);
      state.closeBlock(node);
    },
  },
  {
    bold: marks.strong,
    italic: marks.em,
    code: marks.code,
    link: marks.link,
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    // Formatting markdown can't express, and comment anchors, are dropped.
    underline: { open: "", close: "" },
    comment: { open: "", close: "" },
    fadeIn: { open: "", close: "" },
  }
);

export function markdownToHtml(markdown: string): string {
  return defaultMarkdownParser.tokenizer.render(markdown);
}

// Typed loosely: the editor's nodes come from another copy of
// prosemirror-model than this serializer's (see DocEditor). The serializer only
// reads node names, attributes and text, so either copy works.
export function docToMarkdown(doc: unknown): string {
  return serializer.serialize(doc as PMNode);
}
