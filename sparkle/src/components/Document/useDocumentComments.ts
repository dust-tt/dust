import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type DocumentCommentDraft,
  documentCommentsPluginKey,
  getCommentedTexts,
  getDocumentComments,
  scrollToCommentHighlight,
} from "./DocumentComments";
import type { DocumentComment, DocumentCommentAuthor } from "./types";

const createCommentId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface UseDocumentCommentsProps {
  editor: Editor | null;
  /** Editable JSON document with an author. */
  canComment: boolean;
  author: DocumentCommentAuthor | undefined;
}

interface EditorCommentsState {
  comments: DocumentComment[];
  /** Commented text by comment id, in document order. */
  quotes: Map<string, string>;
  activeId: string | null;
  draft: DocumentCommentDraft | null;
}

const EMPTY_STATE: EditorCommentsState = {
  comments: [],
  quotes: new Map(),
  activeId: null,
  draft: null,
};

/** Where the panel should move focus once it has rendered. */
export interface PanelFocusRequest {
  /** Thread to focus, or null for the panel heading. */
  threadId: string | null;
  nonce: number;
}

/**
 * @cc [owner:flvndvd,label:product] document-comment-authoring
 * Starting, submitting, replying to, resolving and deleting comments MUST require canComment.
 * A pending draft MUST be cancelled when commenting becomes unavailable. New comments and
 * replies MUST carry the current author and creation time.
 */
/**
 * @cc [owner:flvndvd,label:react] document-comment-navigation
 * Selecting a thread MUST make it active and scroll its highlight into view. Revealing a
 * comment from a highlight or marker MUST open the panel and request focus on that thread.
 * Opening the panel from its toggle MUST request focus on the panel. Closing the panel while
 * focus is inside it MUST return focus to the toggle.
 */
export const useDocumentComments = ({
  editor,
  canComment,
  author,
}: UseDocumentCommentsProps) => {
  const state =
    useEditorState({
      editor,
      selector: ({ editor }): EditorCommentsState => {
        if (!editor) {
          return EMPTY_STATE;
        }
        const pluginState = documentCommentsPluginKey.getState(editor.state);
        return {
          comments: getDocumentComments(editor.state.doc),
          quotes: getCommentedTexts(editor.state.doc),
          activeId: pluginState?.activeId ?? null,
          draft: pluginState?.draft ?? null,
        };
      },
    }) ?? EMPTY_STATE;
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<PanelFocusRequest | null>(
    null
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const canWrite = canComment && author !== undefined;
  // Stable identity matters: the markers re-measure the DOM whenever this array changes.
  const unresolved = useMemo(
    () => state.comments.filter((comment) => !comment.resolved),
    [state.comments]
  );

  useEffect(() => {
    if (!canWrite && state.draft && editor) {
      editor.commands.cancelCommentDraft();
    }
  }, [canWrite, state.draft, editor]);

  const requestFocus = (threadId: string | null) =>
    setFocusRequest((current) => ({
      threadId,
      nonce: (current?.nonce ?? 0) + 1,
    }));

  const select = (id: string | null) => {
    editor?.commands.setActiveComment(id);
  };

  const now = () => new Date().toISOString();

  return {
    comments: state.comments,
    unresolved,
    quotes: state.quotes,
    activeId: state.activeId,
    draft: canWrite ? state.draft : null,
    canWrite,
    author,
    panelOpen,
    focusRequest,
    toggleRef,
    panelRef,
    select,
    closePanel: () => {
      if (panelRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setPanelOpen(false);
    },
    togglePanel: () => {
      if (!panelOpen) {
        requestFocus(null);
      }
      setPanelOpen((open) => !open);
    },
    /** Opens the panel on a comment, from a highlight or marker. */
    reveal: (id: string) => {
      select(id);
      setPanelOpen(true);
      requestFocus(id);
    },
    /** Activates a thread from the panel and scrolls to its text. */
    jumpTo: (id: string) => {
      select(id);
      if (editor) {
        scrollToCommentHighlight(editor, id);
      }
    },
    startDraft: () =>
      canWrite && editor ? editor.commands.startCommentDraft() : false,
    cancelDraft: () => {
      editor?.chain().cancelCommentDraft().focus().run();
    },
    submitDraft: (body: string) => {
      const draft = state.draft;
      if (!canWrite || !editor || !author || !draft) {
        return;
      }
      editor
        .chain()
        .addComment({
          id: createCommentId(),
          body,
          author,
          createdAt: now(),
          resolved: false,
          replies: [],
        })
        .focus()
        .setTextSelection(draft.to)
        .run();
      setPanelOpen(true);
    },
    reply: (id: string, body: string) => {
      if (canWrite && editor && author) {
        editor.commands.replyToComment(id, {
          id: createCommentId(),
          body,
          author,
          createdAt: now(),
        });
      }
    },
    /** Resolves or reopens, then focuses the given thread or the panel heading. */
    setResolved: (id: string, resolved: boolean, focusNext: string | null) => {
      if (canWrite && editor) {
        editor.commands.setCommentResolved(id, resolved);
        requestFocus(focusNext);
      }
    },
    remove: (id: string, focusNext: string | null) => {
      if (canWrite && editor) {
        editor.commands.deleteComment(id);
        requestFocus(focusNext);
      }
    },
  };
};

export type DocumentCommentsController = ReturnType<typeof useDocumentComments>;
