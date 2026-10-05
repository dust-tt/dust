import type { DocumentCommentDraft } from "@app/components/editor/document/DocumentComments";
import {
  documentCommentsPluginKey,
  getCommentedTexts,
  getDocumentComments,
  scrollToCommentHighlight,
} from "@app/components/editor/document/DocumentComments";
import { validateCommentThread } from "@app/components/editor/document/dfm_persistence";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

interface UseDocumentCommentsProps {
  editor: Editor | null;
  /** The document is editable. */
  canComment: boolean;
  author: DfmAuthor | undefined;
}

interface EditorCommentsState {
  comments: DfmComment[];
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

const UNAVAILABLE_MESSAGE = "Commenting is unavailable.";

/** Where the panel should move focus once it has rendered. */
export interface PanelFocusRequest {
  /** Thread to focus, or null for the panel heading. */
  threadId: string | null;
  nonce: number;
}

/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comment-authoring
 * Starting, submitting, replying to, resolving and deleting comments MUST require canComment
 * and an author. A pending draft MUST be cancelled when commenting becomes unavailable. New
 * comments and replies MUST carry the current author and creation time, and MUST be refused
 * with a reason, leaving the document unchanged, when the codec cannot write the thread.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-navigation
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
    () => state.comments.filter((comment) => comment.status === "open"),
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

  const message = (writer: DfmAuthor, body: string): DfmMessage => ({
    author: writer,
    createdAt: new Date().toISOString(),
    body,
  });

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
    submitDraft: (body: string): Result<void, string> => {
      const draft = state.draft;
      if (!canWrite || !editor || !author || !draft) {
        return new Err(UNAVAILABLE_MESSAGE);
      }
      const comment: DfmComment = {
        id: crypto.randomUUID(),
        status: "open",
        messages: [message(author, body)],
      };
      const writable = validateCommentThread(comment);
      if (writable.isErr()) {
        return writable;
      }
      editor
        .chain()
        .addComment(comment)
        .focus()
        .setTextSelection(draft.to)
        .run();
      setPanelOpen(true);
      return new Ok(undefined);
    },
    reply: (id: string, body: string): Result<void, string> => {
      const thread = state.comments.find((comment) => comment.id === id);
      if (!canWrite || !editor || !author || !thread) {
        return new Err(UNAVAILABLE_MESSAGE);
      }
      const reply = message(author, body);
      const writable = validateCommentThread({
        ...thread,
        messages: [...thread.messages, reply],
      });
      if (writable.isErr()) {
        return writable;
      }
      editor.commands.replyToComment(id, reply);
      return new Ok(undefined);
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
