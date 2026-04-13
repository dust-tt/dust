import { Extension, Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

// These are the standard markdown token types that no other extension claims.
const SIMPLE_TOKEN_TYPES = ["table", "hr", "blockquote", "def"];

/**
 * Catch-all atom block node for content no other extension claims.
 *
 * Handles two paths:
 *  - Markdown loading: catches unrecognized tokens (via rawMarkdownBlockParsers).
 *  - HTML loading: re-parses nodes previously serialized by this extension
 *    (i.e. <div data-raw-markdown>). Does NOT catch arbitrary unknown elements.
 */
export const RawMarkdownBlock = Node.create({
  name: "rawMarkdownBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      rawContent: {
        default: "",
        parseHTML: (element) => {
          const raw = element.getAttribute("data-content") ?? "";
          // renderToHTMLString JSON-encodes attribute values (newlines → \n,
          // backslashes → \\). Reverse this in a single pass to avoid ambiguity
          // between an encoded newline (\n) and an encoded backslash+n (\\n).
          return raw.replace(/\\(n|r|t|\\)/g, (_, c: string) => {
            switch (c) {
              case "n":
                return "\n";
              case "r":
                return "\r";
              case "t":
                return "\t";
              default:
                return "\\";
            }
          });
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-raw-markdown]" }];
  },

  renderHTML({ node }) {
    return [
      "div",
      { "data-raw-markdown": "", "data-content": node.attrs.rawContent },
    ];
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderMarkdown(node: any) {
    // token.raw already contains trailing newlines from marked.js, so trim
    // before appending the standard block separator to avoid doubled spacing.
    return (node.attrs.rawContent as string).trimEnd();
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownBlockView);
  },
});

interface RawMarkdownBlockViewProps extends NodeViewProps {}

function RawMarkdownBlockView({ node }: RawMarkdownBlockViewProps) {
  return (
    <NodeViewWrapper as="div" contentEditable={false}>
      <div className="whitespace-pre-wrap">
        {node.attrs.rawContent as string}
      </div>
    </NodeViewWrapper>
  );
}

function makeRawMarkdownParser(
  tokenType: string
): ReturnType<typeof Extension.create> {
  return Extension.create({
    name: `rawMarkdownBlock_${tokenType}`,
    markdownTokenName: tokenType,
    parseMarkdown: (token) => ({
      type: "rawMarkdownBlock",
      attrs: { rawContent: token.raw ?? "" },
    }),
  });
}

export const rawMarkdownBlockParsers = SIMPLE_TOKEN_TYPES.map(
  makeRawMarkdownParser
);
