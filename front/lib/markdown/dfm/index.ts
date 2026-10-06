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
