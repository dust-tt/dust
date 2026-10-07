import type { DfmError } from "@app/lib/markdown/dfm";
import { assertNever } from "@app/types/shared/utils/assert_never";

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
 * @cc [owner:sfriquet,label:product] document-error-english-description
 * MUST return the error's reason in English, a codec error as its message followed by
 * ` (line N)` when it has a line. Code running outside the browser, such as the live session
 * server, MUST describe document errors with it rather than translate them.
 */
export function describeDocumentError(error: DocumentError): string {
  switch (error.type) {
    case "unsupported_markdown":
      return "The Markdown uses formatting the editor cannot keep.";
    case "unparsable_markdown":
      return "The Markdown could not be parsed.";
    case "markdown_not_reproducible":
      return "The Markdown would not read back the same after editing.";
    case "comment_edge_not_highlightable":
      return `Comment "${error.commentId}" starts or ends on text the editor cannot highlight.`;
    case "comment_anchor_unpaired":
      return `Comment anchor "${error.commentId}" is not paired where the editor reads it.`;
    case "comment_anchor_unclosed":
      return `Comment anchor "${error.commentId}" is never closed where the editor reads it.`;
    case "comment_without_text":
      return `Comment "${error.commentId}" covers no text the editor can highlight.`;
    case "comment_anchor_hidden":
      return "A comment is anchored where the editor cannot show it.";
    case "formatting_not_savable":
      return "This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again.";
    case "codec_save_refused":
      return "This document cannot be saved as written. Your changes are still here. Undo the last edit to try again.";
    case "codec":
      return error.dfmError.line === undefined
        ? error.dfmError.message
        : `${error.dfmError.message} (line ${error.dfmError.line})`;
    default:
      return assertNever(error);
  }
}
