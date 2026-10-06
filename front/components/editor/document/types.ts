// Shared by Document and its hook to avoid circular type imports.
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import type { ReactNode } from "react";

/** Ok once the content is stored, Err with a message the editor shows next to Retry. */
export type DocumentSaveResult = Result<void, string>;

export type DocumentCommentAvatarSize = "xxs" | "3xs";

export interface DocumentProps {
  /** The DFM source of the file. Remount with a new key to open another document. */
  initialContent: string;
  /** Classes for the outer container. */
  className?: string;
  /** Optional container for formatting tooltips. Defaults to the enclosing sheet or body. */
  mountPortalContainer?: HTMLElement;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Receives the DFM source to persist; resolve Ok once stored, Err with the reason. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
  /** Reports the draft state, so the host can hold navigation while edits are unsaved. */
  onStateChange?: (state: DocumentDraftState) => void;
  /** Shown at the left of the status row, the save status at its right: a marker from the host. */
  badge?: ReactNode;
  /**
   * Signs new comments and replies. Commenting requires an editable document and an author;
   * existing comments stay readable without one.
   */
  commentAuthor?: DfmAuthor;
  /** Renders a comment author's avatar. */
  renderCommentAuthorAvatar: (
    author: DfmAuthor,
    size: DocumentCommentAvatarSize
  ) => ReactNode;
}

export interface DocumentDraftState {
  dirty: boolean;
  saving: boolean;
  /** The last save failure shown to the user, or null. */
  error: string | null;
}
