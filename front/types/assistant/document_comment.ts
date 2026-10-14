export const DOCUMENT_COMMENT_DIRECTIVE_NAME = "document_comment";

const QUOTE_MAX_LENGTH = 500;

const LABEL_PATTERN = String.raw`((?:\\.|[^\\\]\n])*)`;
const ATTRIBUTES_PATTERN = String.raw`id="([^"\n]*)" path="([^"\n]*)"`;

export const DOCUMENT_COMMENT_DIRECTIVE_REGEX = new RegExp(
  String.raw`:${DOCUMENT_COMMENT_DIRECTIVE_NAME}\[${LABEL_PATTERN}\]\{${ATTRIBUTES_PATTERN}\}`,
  "g"
);

const LEADING_DOCUMENT_COMMENT_DIRECTIVE_REGEX = new RegExp(
  String.raw`^:${DOCUMENT_COMMENT_DIRECTIVE_NAME}\[${LABEL_PATTERN}\]\{${ATTRIBUTES_PATTERN}\}(?:\n\n)?`
);

export interface DocumentComment {
  commentId: string;
  documentPath: string;
  quote: string | null;
}

const escapeLabel = (text: string) => text.replace(/[\\[\]]/g, "\\$&");

export const unescapeDocumentCommentLabel = (label: string) =>
  label.replace(/\\(.)/g, "$1");

const escapeAttribute = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

export const unescapeDocumentCommentAttribute = (value: string) =>
  value.replaceAll("&quot;", '"').replaceAll("&amp;", "&");

function quoteLabel(quote: string | null): string {
  const flat = (quote ?? "").replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_MAX_LENGTH
    ? `${flat.slice(0, QUOTE_MAX_LENGTH)}…`
    : flat;
}

/**
 * @cc [owner:adrien,label:product] document-comment-directive
 * The directive MUST hold the thread's id and the document's path so
 * `parseDocumentCommentMessage` gives them back unchanged, and the quoted passage on one line,
 * capped at `QUOTE_MAX_LENGTH` characters, or an empty label when there is none.
 */
export function serializeDocumentCommentDirective({
  commentId,
  documentPath,
  quote,
}: DocumentComment): string {
  return `:${DOCUMENT_COMMENT_DIRECTIVE_NAME}[${escapeLabel(quoteLabel(quote))}]{id="${escapeAttribute(commentId)}" path="${escapeAttribute(documentPath)}"}`;
}

export function parseDocumentCommentMessage(
  content: string
): { comment: DocumentComment; body: string } | null {
  const match = content.match(LEADING_DOCUMENT_COMMENT_DIRECTIVE_REGEX);
  if (!match) {
    return null;
  }
  const [directive, label, commentId, documentPath] = match;
  const quote = unescapeDocumentCommentLabel(label);
  return {
    comment: {
      commentId: unescapeDocumentCommentAttribute(commentId),
      documentPath: unescapeDocumentCommentAttribute(documentPath),
      quote: quote || null,
    },
    body: content.slice(directive.length),
  };
}
