import type { ReactNode } from "react";

// Shared by Document and its hook to avoid circular type imports.
export type DocumentSaveResult = { ok: true } | { ok: false; error: string };

export interface DocumentCommentAuthor {
  name: string;
  avatarUrl?: string | null;
}

export interface DocumentCommentReply {
  id: string;
  body: string;
  author: DocumentCommentAuthor;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** A thread anchored to commented text. Stored in the document JSON under `attrs.comments`. */
export interface DocumentComment extends DocumentCommentReply {
  resolved: boolean;
  replies: DocumentCommentReply[];
}

export interface DocumentProps {
  /** Starting content. Remount with a new key to open another document. */
  initialContent: string;
  contentType?: "markdown" | "json";
  /** Format passed to onSave. Defaults to JSON, independently of contentType. */
  saveFormat?: "markdown" | "json";
  /** Classes for the outer container. */
  className?: string;
  /** Optional container for formatting tooltips. Defaults to the enclosing sheet or body. */
  mountPortalContainer?: HTMLElement;
  readOnly?: boolean;
  /** React content for named visual blocks. JSON stores only the name. */
  visuals?: Record<string, ReactNode>;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Persist the selected save format before returning { ok: true }. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
  /**
   * Identity attached to new comments and replies. Commenting requires an editable document
   * saved as JSON and an author. Existing comments stay readable without one.
   */
  commentAuthor?: DocumentCommentAuthor;
}
