import type { DocumentCommentDraft } from "@app/components/editor/document/DocumentComments";
import {
  documentCommentsPluginKey,
  getClickedCommentIds,
  getCommentedTexts,
  getCommentStarts,
  getDocumentComments,
  scrollToCommentHighlight,
} from "@app/components/editor/document/DocumentComments";
import { validateCommentThread } from "@app/components/editor/document/dfm_persistence";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ChainedCommands, Editor, JSONContent } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

interface UseDocumentCommentsProps {
  editor: Editor | null;
  /** The document is editable. */
  canComment: boolean;
  author: DfmAuthor | undefined;
  /** Whether the document, as TipTap JSON, would save. */
  isSavable: (document: JSONContent) => boolean;
}

interface EditorCommentsState {
  comments: DfmComment[];
  /** Commented text by comment id, in document order. */
  quotes: Map<string, string>;
  /** Position of the first commented text by comment id. */
  starts: Map<string, number>;
  activeId: string | null;
  draft: DocumentCommentDraft | null;
  /** The text the pending draft covers. */
  draftQuote: string;
}

const EMPTY_STATE: EditorCommentsState = {
  comments: [],
  quotes: new Map(),
  starts: new Map(),
  activeId: null,
  draft: null,
  draftQuote: "",
};

const UNAVAILABLE_MESSAGE = "Commenting is unavailable.";
const UNANCHORED_MESSAGE =
  "The selected text can no longer take a comment. Select other text to comment.";
const UNSAVABLE_MESSAGE =
  "The document could not be saved with this comment. Try a shorter one.";

/** The document the commands would produce, or null when one of them refuses. */
const previewDocument = (
  editor: Editor,
  apply: (chain: ChainedCommands) => ChainedCommands
): Node | null => {
  let next: Node | null = null;
  const applied = apply(editor.chain())
    .command(({ tr }) => {
      next = tr.doc;
      // TipTap drops a chain's transaction carrying this meta instead of dispatching it.
      tr.setMeta("preventDispatch", true);
      return true;
    })
    .run();
  return applied ? next : null;
};

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
 * with a reason, leaving the document unchanged, when the codec cannot write the thread or the
 * document would no longer save with it.
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
  isSavable,
}: UseDocumentCommentsProps) => {
  const state =
    useEditorState({
      editor,
      selector: ({ editor }): EditorCommentsState => {
        if (!editor) {
          return EMPTY_STATE;
        }
        const pluginState = documentCommentsPluginKey.getState(editor.state);
        const draft = pluginState?.draft ?? null;
        return {
          comments: getDocumentComments(editor.state.doc),
          quotes: getCommentedTexts(editor.state.doc),
          starts: getCommentStarts(editor.state.doc),
          activeId: pluginState?.activeId ?? null,
          draft,
          draftQuote: draft
            ? editor.state.doc.textBetween(draft.from, draft.to, " ")
            : "",
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

  const reveal = (id: string) => {
    select(id);
    setPanelOpen(true);
    requestFocus(id);
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
    starts: state.starts,
    activeId: state.activeId,
    draft: canWrite ? state.draft : null,
    draftQuote: state.draftQuote,
    canWrite,
    author,
    panelOpen,
    focusRequest,
    toggleRef,
    panelRef,
    select,
    closePanel: () => {
      if (state.draft) {
        editor?.commands.cancelCommentDraft();
      }
      if (panelRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setPanelOpen(false);
    },
    togglePanel: () => {
      if (!panelOpen) {
        requestFocus(null);
      } else if (state.draft) {
        editor?.commands.cancelCommentDraft();
      }
      setPanelOpen((open) => !open);
    },
    /** Opens the panel on a comment, from a highlight or marker. */
    reveal,
    /**
     * Reveals the comment under a click in the text: the one covering the least text first,
     * then wider ones on repeated clicks. A click outside every comment clears the active one.
     */
    revealClicked: (target: EventTarget | null) => {
      // A drag or double click on commented text selects it; revealing would steal its focus.
      if (!editor || !editor.state.selection.empty) {
        return;
      }
      const clicked = getClickedCommentIds(target, editor.view.dom);
      if (clicked.length === 0) {
        if (state.activeId !== null) {
          select(null);
        }
        return;
      }
      const ids = clicked.sort(
        (a, b) =>
          (state.quotes.get(a)?.length ?? 0) -
          (state.quotes.get(b)?.length ?? 0)
      );
      const current = state.activeId ? ids.indexOf(state.activeId) : -1;
      reveal(ids[(current + 1) % ids.length]);
    },
    /** Activates a thread from the panel and scrolls to its text. */
    jumpTo: (id: string) => {
      select(id);
      if (editor) {
        scrollToCommentHighlight(editor, id);
      }
    },
    /** Starts a comment on the selection and opens the panel on its card. */
    startDraft: () => {
      if (!canWrite || !editor || !editor.commands.startCommentDraft()) {
        return false;
      }
      // The draft card takes focus; an older request would steal it when the panel opens.
      setFocusRequest(null);
      setPanelOpen(true);
      return true;
    },
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
      const next = previewDocument(editor, (chain) =>
        chain.addComment(comment)
      );
      if (!next) {
        return new Err(UNANCHORED_MESSAGE);
      }
      if (!isSavable(next.toJSON())) {
        return new Err(UNSAVABLE_MESSAGE);
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
      const next = previewDocument(editor, (chain) =>
        chain.replyToComment(id, reply)
      );
      if (!next || !isSavable(next.toJSON())) {
        return new Err(UNSAVABLE_MESSAGE);
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
