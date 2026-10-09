// Shared by Document and its hook to avoid circular type imports.
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmAuthor, DfmMessage } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import type { Extensions } from "@tiptap/core";
import type { ReactNode } from "react";

/** Ok once the content is stored, Err with a message the editor shows next to Retry. */
export type DocumentSaveResult = Result<void, string>;

export type DocumentCommentAvatarSize = "xxs" | "3xs";

export interface DocumentProps {
  /** The DFM source of the file. Remount with a new key to open another document. */
  initialContent: string;
  /** Classes for the outer container. */
  className?: string;
  /** Optional container for the comments' tooltips. Defaults to the enclosing sheet or body. */
  mountPortalContainer?: HTMLElement;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Receives the DFM source to persist; resolve Ok once stored, Err with the reason. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
  /**
   * Edits the document live with everyone else in the session instead of saving it. The file's
   * content shows read-only until the session has synced. Comments go through the session.
   */
  live?: DocumentLiveSession;
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
  /**
   * Has the server write and sign a new message for the comment, after the messages already in
   * `thread` (none for a new thread); resolve with the message to insert, or Err with the reason.
   * Without it, new messages are built locally and unsigned.
   */
  signCommentMessage?: (
    commentId: string,
    thread: DfmMessage[],
    body: string
  ) => Promise<Result<DfmMessage, string>>;
  /** Checks a message's signature; without it, messages are shown without a verification mark. */
  verifyCommentMessage?: DfmMessageVerifier;
  renderCommentBody: (body: string) => ReactNode;
  /**
   * Added to the comment and reply fields' editors, such as mentions. Each field captures them
   * when it mounts, so keep the list stable.
   */
  commentInputExtensions?: Extensions;
}

/** Where and as whom a Document joins its live session. */
export interface DocumentLiveSession {
  url: string;
  documentName: string;
  /** Fetches a one-time ticket for each connection; throws when access is refused. */
  getTicket: () => Promise<string>;
  user: { id: string; name: string; color: string };
}

/** Where a live document's connection stands, shown in place of the save status. */
export type LiveStatus = "connecting" | "live" | "offline" | "refused";

export interface DocumentDraftState {
  dirty: boolean;
  saving: boolean;
  /** The last save failure shown to the user, or null. */
  error: string | null;
}
