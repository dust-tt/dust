/**
 * DFM, Dust-Flavored Markdown: Markdown files that humans edit in the rich editor and agents
 * edit as text, carrying comments as directives. The format and the module layout are in
 * README.md next to this file.
 */

export {
  anchorDirective,
  extractAnchors,
  findAnchorDirective,
  readAnchorDirective,
} from "@app/lib/markdown/dfm/anchors";
export {
  dfmCommentSchema,
  dfmCommentsSchema,
} from "@app/lib/markdown/dfm/annotations";
export { parseDfm, serializeDfm } from "@app/lib/markdown/dfm/document";
export { anchorComment } from "@app/lib/markdown/dfm/operations";
export { checkInputBounds } from "@app/lib/markdown/dfm/parser";
export { messageSignaturePayload } from "@app/lib/markdown/dfm/signatures";
export type { DfmMessagePart } from "@app/lib/markdown/dfm/suggestions";
export {
  readMessageSuggestions,
  SUGGESTION_LANGUAGE,
  suggestionBlock,
} from "@app/lib/markdown/dfm/suggestions";
export type {
  DfmAnchor,
  DfmAnchorDirective,
  DfmAuthor,
  DfmAuthorKind,
  DfmComment,
  DfmCommentStatus,
  DfmDocument,
  DfmError,
  DfmMessage,
} from "@app/lib/markdown/dfm/types";
