// Shared by Document and its hook to avoid circular type imports.
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import type { Extensions } from "@tiptap/core";
import type { ReactNode } from "react";

export type DocumentCommentAvatarSize = "xs" | "xxs" | "3xs";

export interface DocumentProps {
  /** The DFM source of the file. Remount with a new key to open another document. */
  initialContent: string;
  /** Classes for the outer container. */
  className?: string;
  /** Optional container for the comments' tooltips. Defaults to the enclosing sheet or body. */
  mountPortalContainer?: HTMLElement;
  /**
   * Where the comments button shows, such as the host's header bar. Without it, it shows above the
   * document with the live status.
   */
  headerControlsContainer?: HTMLElement | null;
  /**
   * Where the live status shows as one icon, such as next to the host's file name. Without it the
   * statuses show in the badge above the document.
   */
  statusContainer?: HTMLElement | null;
  readOnly?: boolean;
  /**
   * Edits the document live with everyone else in the session; without it, the document is
   * read-only. The file's content shows read-only until the session has synced. Comments go
   * through the session.
   */
  live?: DocumentLiveSession;
  /**
   * Signs new comments and replies. Commenting requires an editable document and an author;
   * existing comments stay readable without one.
   */
  commentAuthor?: DfmAuthor;
  /** Renders a comment author's avatar, or the agent at work in a live document's. */
  renderCommentAuthorAvatar: (
    author: DfmAuthor,
    size: DocumentCommentAvatarSize
  ) => ReactNode;
  /** Checks a message's signature; without it, messages are shown without a verification mark. */
  verifyCommentMessage?: DfmMessageVerifier;
  renderCommentBody: (body: string) => ReactNode;
  /**
   * Added to the comment and reply fields' editors, such as mentions. Each field captures them
   * when it mounts, so keep the list stable.
   */
  commentInputExtensions?: Extensions;
  /** The URL to display an image at, from its Markdown source, or null to show its alt text. */
  resolveImageSource: (src: string) => string | null;
  /** Files the `/` menu offers to embed. Without them, it offers no image. */
  embeddableFiles?: DocumentEmbeddableFiles;
  /** Shown at the start of the status row, kept in view above the document, such as a stage badge. */
  badge?: ReactNode;
  /** Renders the users in the live session, the current one first, such as an avatar stack. */
  renderLiveParticipants?: (
    participants: DocumentLiveParticipant[]
  ) => ReactNode;
}

/** A file of the document's conversation or pod, embedded by its path. */
export interface DocumentEmbeddableFile {
  kind: "image";
  path: string;
  name: string;
}

/** The host's files to embed, loaded only once the `/` menu asks for them. */
export interface DocumentEmbeddableFiles {
  /** Empty until loaded. */
  files: DocumentEmbeddableFile[];
  isLoading: boolean;
  /** Asks the host to load `files`. */
  load: () => void;
}

/** Where and as whom a Document joins its live session. */
export interface DocumentLiveSession {
  url: string;
  documentName: string;
  /** Fetches a one-time ticket for each connection; throws when access is refused. */
  getTicket: () => Promise<string>;
  user: { id: string; name: string; color: string };
}

/** A user with the live document open. */
export interface DocumentLiveParticipant {
  id: string;
  name: string;
}

/** Where a live document's connection stands. */
export type LiveStatus = "connecting" | "live" | "offline" | "refused";
