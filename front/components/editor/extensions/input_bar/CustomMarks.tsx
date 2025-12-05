import type {
  MarkdownLexerConfiguration,
  MarkdownRendererHelpers,
  MarkdownToken,
} from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import type { JSONContent } from "@tiptap/react";

/**
 * We need to extend the default Bold and Italic extensions to add custom markdown parsing and serialization.
 * The backend can send markdown with spaces like `** bold**` or `**bold **`, so we need to handle those patterns.
 */

/**
 * Custom Bold extension with markdown serialization using ** syntax.
 */
export const CustomBold = Bold.extend({
  markdownTokenizer: {
    name: "bold",
    level: "inline", // inline element
    start: (src: string) => src.indexOf("**"),
    tokenize: (
      src: string,
      tokens: MarkdownToken[],
      lexer: MarkdownLexerConfiguration
    ) => {
      const match = /^\*\*(\s*.+?\s*)\*\*/.exec(src);
      if (!match) {
        return undefined;
      }

      return {
        type: "bold",
        raw: match[0],
        text: match[1],
        tokens: lexer.inlineTokens(match[1]),
      };
    },
  },
});

/**
 * Custom Italic extension with markdown serialization using _ syntax.
 */
export const CustomItalic = Italic.extend({
  markdownTokenizer: {
    name: "italic",
    level: "inline", // inline element
    start: (src: string) => src.indexOf("_"),
    tokenize: (
      src: string,
      tokens: MarkdownToken[],
      lexer: MarkdownLexerConfiguration
    ) => {
      const match = /^_(\s*.+?\s*)_/.exec(src);
      if (!match) {
        return undefined;
      }

      return {
        type: "italic",
        raw: match[0],
        text: match[1],
        tokens: lexer.inlineTokens(match[1]),
      };
    },
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => {
    const content = helpers.renderChildren(node);
    return `_${content}_`;
  },
});
