import type { DfmError } from "@app/lib/markdown/dfm";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/** Why the editor refuses to open a file or to save a document. */
export type DocumentError =
  | { type: "unsupported_markdown" }
  | { type: "unparsable_markdown" }
  | { type: "markdown_not_reproducible" }
  | { type: "comment_edge_not_highlightable"; commentId: string }
  | { type: "comment_anchor_unpaired"; commentId: string }
  | { type: "comment_anchor_unclosed"; commentId: string }
  | { type: "comment_without_text"; commentId: string }
  | { type: "comment_anchor_hidden" }
  | { type: "formatting_not_savable" }
  | { type: "codec_save_refused" }
  | { type: "codec"; dfmError: DfmError };

/**
 * @cc [owner:sfriquet,label:product] document-error-description
 * MUST return the error's reason translated with `t`, a codec error as its message from
 * `lib/markdown/dfm`, kept in English, followed by a translated ` (line N)` when it has a line.
 * Code running outside the browser, such as the live session server, MUST pass
 * `defaultLocaleI18n.t`.
 */
export function describeDocumentError(
  error: DocumentError,
  t: (descriptor: MessageDescriptor) => string
): string {
  switch (error.type) {
    case "unsupported_markdown":
      return t(msg`The Markdown uses formatting the editor cannot keep.`);
    case "unparsable_markdown":
      return t(msg`The Markdown could not be parsed.`);
    case "markdown_not_reproducible":
      return t(msg`The Markdown would not read back the same after editing.`);
    case "comment_edge_not_highlightable": {
      const { commentId } = error;
      return t(
        msg`Comment "${commentId}" starts or ends on text the editor cannot highlight.`
      );
    }
    case "comment_anchor_unpaired": {
      const { commentId } = error;
      return t(
        msg`Comment anchor "${commentId}" is not paired where the editor reads it.`
      );
    }
    case "comment_anchor_unclosed": {
      const { commentId } = error;
      return t(
        msg`Comment anchor "${commentId}" is never closed where the editor reads it.`
      );
    }
    case "comment_without_text": {
      const { commentId } = error;
      return t(
        msg`Comment "${commentId}" covers no text the editor can highlight.`
      );
    }
    case "comment_anchor_hidden":
      return t(msg`A comment is anchored where the editor cannot show it.`);
    case "formatting_not_savable":
      return t(
        msg`This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again.`
      );
    case "codec_save_refused":
      return t(
        msg`This document cannot be saved as written. Your changes are still here. Undo the last edit to try again.`
      );
    case "codec": {
      const { message, line } = error.dfmError;
      return line === undefined ? message : t(msg`${message} (line ${line})`);
    }
    default:
      return assertNever(error);
  }
}
