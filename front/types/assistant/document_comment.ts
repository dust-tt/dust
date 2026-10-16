import type {
  UserMessageOrigin,
  UserMessageType,
} from "@app/types/assistant/conversation";

export const DOCUMENT_COMMENT_DIRECTIVE_NAME = "document_comment";

const QUOTE_MAX_LENGTH = 500;

const DIRECTIVE_PATTERN = String.raw`:${DOCUMENT_COMMENT_DIRECTIVE_NAME}\[((?:\\.|[^\\\]\n])*)\]\{id="([^"\n]*)" path="([^"\n]*)"\}`;

const DOCUMENT_COMMENT_DIRECTIVE_REGEX = new RegExp(DIRECTIVE_PATTERN, "g");

const LEADING_DOCUMENT_COMMENT_DIRECTIVE_REGEX = new RegExp(
  String.raw`^${DIRECTIVE_PATTERN}(?:\n\n)?`
);

export interface DocumentComment {
  commentId: string;
  documentPath: string;
  quote: string | null;
}

export const isDocumentCommentOrigin = (origin: UserMessageOrigin | null) =>
  origin === "document_comment";

const escapeLabel = (text: string) => text.replace(/[\\[\]]/g, "\\$&");

const unescapeLabel = (label: string) => label.replace(/\\(.)/g, "$1");

const escapeAttribute = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

const unescapeAttribute = (value: string) =>
  value.replaceAll("&quot;", '"').replaceAll("&amp;", "&");

function quoteLabel(quote: string | null): string {
  const flat = (quote ?? "").replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_MAX_LENGTH
    ? `${flat.slice(0, QUOTE_MAX_LENGTH - 1)}…`
    : flat;
}

function toDocumentComment(
  label: string,
  commentId: string,
  documentPath: string
): DocumentComment {
  return {
    commentId: unescapeAttribute(commentId),
    documentPath: unescapeAttribute(documentPath),
    quote: unescapeLabel(label) || null,
  };
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
  return {
    comment: toDocumentComment(label, commentId, documentPath),
    body: content.slice(directive.length),
  };
}

export function replaceDocumentCommentDirectives(
  text: string,
  replace: (comment: DocumentComment) => string
): string {
  return text.replaceAll(
    DOCUMENT_COMMENT_DIRECTIVE_REGEX,
    (_directive, label: string, commentId: string, documentPath: string) =>
      replace(toDocumentComment(label, commentId, documentPath))
  );
}

export const documentCommentOf = ({
  content,
  context,
}: Pick<UserMessageType, "content" | "context">): DocumentComment | null =>
  isDocumentCommentOrigin(context.origin)
    ? (parseDocumentCommentMessage(content)?.comment ?? null)
    : null;
