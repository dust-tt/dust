import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DocumentCommentDraft,
  documentCommentsPluginKey,
  getDocumentComments,
} from "./DocumentComments";
import type { DocumentComment, DocumentCommentAuthor } from "./types";

const NO_COMMENTS: DocumentComment[] = [];

export const createCommentId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const escapeAttributeValue = (value: string) =>
  value.replace(/["\\]/g, "\\$&");

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const scrollToCommentHighlight = (editor: Editor, id: string) => {
  editor.view.dom
    .querySelector<HTMLElement>(
      `[data-comment-highlight="${escapeAttributeValue(id)}"]`
    )
    ?.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "instant" : "smooth",
    });
};

/** Increments after each document change and when the editor's DOM resizes. */
export const useEditorLayoutVersion = (editor: Editor | null) => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const bump = () => setVersion((value) => value + 1);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(bump) : null;

    // Selection-only transactions follow every render, so only document changes count.
    editor.on("update", bump);
    observer?.observe(editor.view.dom);
    window.addEventListener("resize", bump);

    return () => {
      editor.off("update", bump);
      observer?.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [editor]);

  return version;
};

interface UseDocumentCommentsProps {
  editor: Editor | null;
  /** Editable JSON document with an author. */
  canComment: boolean;
  author: DocumentCommentAuthor | undefined;
}

interface EditorCommentsState {
  comments: DocumentComment[];
  activeId: string | null;
  draft: DocumentCommentDraft | null;
}

const EMPTY_STATE: EditorCommentsState = {
  comments: NO_COMMENTS,
  activeId: null,
  draft: null,
};

/**
 * @cc [owner:flvndvd,label:product] document-comment-authoring
 * Starting, submitting, replying to, resolving and deleting comments MUST require canComment.
 * A pending draft MUST be cancelled when commenting becomes unavailable. New comments and
 * replies MUST carry the current author and creation time.
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
          activeId: pluginState?.activeId ?? null,
          draft: pluginState?.draft ?? null,
        };
      },
    }) ?? EMPTY_STATE;
  const [panelOpen, setPanelOpen] = useState(false);
  const canWrite = canComment && author !== undefined;
  const unresolved = useMemo(
    () => state.comments.filter((comment) => !comment.resolved),
    [state.comments]
  );

  const cancelDraft = useCallback(() => {
    editor?.chain().cancelCommentDraft().focus().run();
  }, [editor]);

  useEffect(() => {
    if (!canWrite && state.draft && editor) {
      editor.commands.cancelCommentDraft();
    }
  }, [canWrite, state.draft, editor]);

  const select = useCallback(
    (id: string | null) => {
      editor?.commands.setActiveComment(id);
    },
    [editor]
  );

  const reveal = useCallback(
    (id: string) => {
      select(id);
      setPanelOpen(true);
    },
    [select]
  );

  const jumpTo = useCallback(
    (id: string) => {
      select(id);
      if (editor) {
        scrollToCommentHighlight(editor, id);
      }
    },
    [editor, select]
  );

  const startDraft = useCallback(
    () => (canWrite && editor ? editor.commands.startCommentDraft() : false),
    [canWrite, editor]
  );

  const submitDraft = useCallback(
    (body: string) => {
      const draft = state.draft;
      if (!canWrite || !editor || !author || !draft) {
        return;
      }
      const id = createCommentId();
      editor
        .chain()
        .addComment({
          id,
          body,
          author,
          createdAt: new Date().toISOString(),
          resolved: false,
          replies: [],
        })
        .focus()
        .setTextSelection(draft.to)
        .run();
      setPanelOpen(true);
    },
    [author, canWrite, editor, state.draft]
  );

  const reply = useCallback(
    (id: string, body: string) => {
      if (!canWrite || !editor || !author) {
        return;
      }
      editor.commands.replyToComment(id, {
        id: createCommentId(),
        body,
        author,
        createdAt: new Date().toISOString(),
      });
    },
    [author, canWrite, editor]
  );

  const setResolved = useCallback(
    (id: string, resolved: boolean) => {
      if (canWrite && editor) {
        editor.commands.setCommentResolved(id, resolved);
      }
    },
    [canWrite, editor]
  );

  const remove = useCallback(
    (id: string) => {
      if (canWrite && editor) {
        editor.commands.deleteComment(id);
      }
    },
    [canWrite, editor]
  );

  return {
    comments: state.comments,
    unresolved,
    activeId: state.activeId,
    draft: canWrite ? state.draft : null,
    canWrite,
    panelOpen,
    openPanel: () => setPanelOpen(true),
    closePanel: () => setPanelOpen(false),
    togglePanel: () => setPanelOpen((open) => !open),
    select,
    reveal,
    jumpTo,
    startDraft,
    cancelDraft,
    submitDraft,
    reply,
    setResolved,
    remove,
  };
};

export type DocumentCommentsController = ReturnType<typeof useDocumentComments>;
