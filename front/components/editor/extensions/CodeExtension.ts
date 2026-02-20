import { markInputRule, markPasteRule } from "@tiptap/core";
import { Code } from "@tiptap/extension-code";

/**
 * Regex for inline code that respects backslash-escaped backticks.
 *
 * The default TipTap Code extension uses `[^`]+` for the content between
 * backticks, which stops at ANY backtick — even escaped ones like `\``.
 *
 * Changes from the default regex:
 * - Opening: `(^|[^`\\])` instead of `(^|[^`])` — a backtick preceded by `\`
 *   cannot open a code span.
 * - Content: `((?:[^`\\]|\\.)+)` instead of `([^`]+)` — allows escaped
 *   backticks (`\``) inside the code span. The `\\.` alternative consumes any
 *   backslash+char pair, so `\`` is treated as content, not a closing delimiter.
 */
// eslint-disable-next-line no-useless-escape
const inputRegex = /(^|[^`\\])`((?:[^`\\]|\\.)+)`(?!`)$/;
// eslint-disable-next-line no-useless-escape
const pasteRegex = /(^|[^`\\])`((?:[^`\\]|\\.)+)`(?!`)/g;

export const CodeExtension = Code.extend({
  addInputRules() {
    return [
      markInputRule({
        find: inputRegex,
        type: this.type,
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: pasteRegex,
        type: this.type,
      }),
    ];
  },
});
