import { cn } from "@sparkle/lib/utils";
import {
  type AnyExtension,
  type ExtendableConfig,
  flattenExtensions,
  getExtensionField,
  type MarkdownToken,
  Node,
} from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import React from "react";
import { z } from "zod";

const MARKDOWN_SOURCE = "markdownSource";
const markdownSourceText = z.string();

const MarkdownSourceView = ({ node, selected }: NodeViewProps) => (
  <NodeViewWrapper
    contentEditable={false}
    className={cn(
      "my-6 rounded-xl border border-border bg-muted-background",
      selected && "ring-2 ring-ring"
    )}
  >
    <p className="px-5 pt-3 text-muted-foreground copy-xs">
      Formatting not supported yet. Kept as written.
    </p>
    <pre className="overflow-x-auto whitespace-pre-wrap px-5 pt-2 pb-4 font-mono text-sm leading-relaxed wrap-anywhere">
      {node.attrs.source}
    </pre>
  </NodeViewWrapper>
);

/**
 * @cc [owner:flvndvd,label:product] document-markdown-source-block
 * A top-level block whose Markdown the editor cannot represent MUST load as a read-only
 * source block holding its original text and MUST be written back verbatim. Only the
 * smallest enclosing top-level block is preserved this way; the rest stays editable.
 */
export const MarkdownSource = Node.create({
  name: MARKDOWN_SOURCE,
  group: "block",
  atom: true,
  addAttributes: () => ({
    source: {
      default: "",
      validate: (value: unknown) => {
        markdownSourceText.parse(value);
      },
      parseHTML: (element) => element.textContent,
      renderHTML: null,
    },
  }),
  parseHTML: () => [{ tag: "pre[data-markdown-source]" }],
  renderHTML: ({ node }) => [
    "pre",
    { "data-markdown-source": "" },
    markdownSourceText.parse(node.attrs.source),
  ],
  parseMarkdown: (token) => ({
    type: MARKDOWN_SOURCE,
    attrs: { source: (token.raw ?? "").trimEnd() },
  }),
  renderMarkdown: (node) => markdownSourceText.parse(node.attrs?.source),
  addNodeView: () => ReactNodeViewRenderer(MarkdownSourceView),
});

export type DocumentMarked = MarkdownManager["instance"];

// The marked instance TipTap's Markdown extension uses by default.
const tiptapMarked: DocumentMarked = new MarkdownManager().instance;

/**
 * @cc [owner:flvndvd,label:architecture] document-markdown-capabilities
 * Supported token names MUST derive from the editor extensions' parse and render handlers.
 */
const getSupportedTokenTypes = (extensions: AnyExtension[]) =>
  new Set(
    flattenExtensions(extensions)
      .filter(
        (extension) =>
          getExtensionField<ExtendableConfig["parseMarkdown"]>(
            extension,
            "parseMarkdown"
          ) &&
          getExtensionField<ExtendableConfig["renderMarkdown"]>(
            extension,
            "renderMarkdown"
          )
      )
      .map(
        (extension) =>
          getExtensionField<ExtendableConfig["markdownTokenName"]>(
            extension,
            "markdownTokenName"
          ) || extension.name
      )
  );

/**
 * A marked instance whose lexer replaces every top-level block the given extensions
 * cannot represent with a `markdownSource` token holding its original text.
 */
export const createDocumentMarked = (
  extensions: AnyExtension[]
): DocumentMarked => {
  const supportedTokenTypes = getSupportedTokenTypes(extensions);

  const isSupportedToken = (token: MarkdownToken) =>
    token.type !== undefined &&
    // Whitespace separates blocks without an editor extension.
    (token.type === "space" || supportedTokenTypes.has(token.type)) &&
    // Registered list and code handlers still discard task markers and tilde fences.
    !(token.type === "list_item" && token.task) &&
    (token.type !== "code" ||
      token.raw?.startsWith("```") ||
      token.codeBlockStyle === "indented");

  const isSupported = (token: MarkdownToken): boolean =>
    isSupportedToken(token) &&
    (token.items ?? token.tokens ?? []).every(isSupported);

  class DocumentLexer extends tiptapMarked.Lexer {
    lex(src: string) {
      const tokens = super.lex(src);

      tokens.forEach((token, index) => {
        if (!isSupported(token)) {
          tokens[index] = { type: MARKDOWN_SOURCE, raw: token.raw };
        }
      });

      return tokens;
    }
  }

  // MarkdownManager types this option as the marked singleton but only uses its instance API.
  return { ...tiptapMarked, Lexer: DocumentLexer } as DocumentMarked;
};
