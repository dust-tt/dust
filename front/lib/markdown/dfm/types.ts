export type DfmAuthorKind = "user" | "agent";

export interface DfmAuthor {
  kind: DfmAuthorKind;
  id: string;
  name: string;
}

export interface DfmMessage {
  author: DfmAuthor;
  /** ISO 8601 timestamp with seconds and a zone, such as 2026-09-25T14:16:32.380Z. */
  createdAt: string;
  body: string;
}

export type DfmCommentStatus = "open" | "resolved";

export interface DfmComment {
  id: string;
  status: DfmCommentStatus;
  /** The first message is the comment itself, the rest are replies. Never empty. */
  messages: DfmMessage[];
}

export interface DfmDocument {
  /** Raw YAML between the front matter fences, or null without front matter. */
  frontMatter: string | null;
  /** Markdown body with its anchor directives, without the annotations block. */
  body: string;
  comments: DfmComment[];
}

/**
 * A commented range, as offsets into the body once anchor directives are removed. Offsets are
 * UTF-16 code units, as `String.prototype.slice` counts them, not code points or editor positions.
 */
export interface DfmAnchor {
  id: string;
  start: number;
  end: number;
}

/** An anchor directive read from the start of a string, `length` characters long. */
export interface DfmAnchorDirective {
  kind: "start" | "end";
  id: string;
  length: number;
}

export interface DfmError {
  message: string;
  /** 1-based line in the source when the error is located. */
  line?: number;
}
