import { isWritableThread } from "@app/components/editor/document/dfm_persistence";
import type { DocumentCommentDraft } from "@app/components/editor/document/DocumentComments";
import {
  documentCommentsPluginKey,
  getClickedCommentIds,
  getCommentedTexts,
  getCommentStarts,
  getDocumentComments,
  scrollToCommentHighlight,
} from "@app/components/editor/document/DocumentComments";
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
  /** Has the server write and sign a new message; without it, messages are built locally. */
  sign?: (
    commentId: string,
    thread: DfmMessage[],
    body: string
  ) => Promise<Result<DfmMessage, string>>;
  verify?: DfmMessageVerifier;
}

interface Verification {
  /** The threads and verifier the results belong to; results for others are stale. */
  comments: DfmComment[];
  verify: DfmMessageVerifier;
  /** Whether each message verified, by `${commentId}:${index}`. */
  results: Map<string, boolean>;
}

interface EditorCommentsState {
  /** Commented text by comment id, in document order. */
  quotes: Map<string, string>;
  /** Position of the first commented text by comment id. */
  starts: Map<string, number>;
  activeId: string | null;
  draft: DocumentCommentDraft | null;
  /** The text the pending draft covers. */
  draftQuote: string;
}

const EMPTY_COMMENTS: DfmComment[] = [];

const EMPTY_STATE: EditorCommentsState = {
  quotes: new Map(),
  starts: new Map(),
  activeId: null,
  draft: null,
  draftQuote: "",
};

const UNAVAILABLE_MESSAGE = msg`Commenting is unavailable.`;
const UNANCHORED_MESSAGE = msg`The selected text can no longer take a comment. Select other text to comment.`;
const UNSAVABLE_MESSAGE = msg`This comment can't be saved in this document. Try shortening or simplifying it.`;

const sameMessage = (a: DfmMessage | undefined, b: DfmMessage | undefined) =>
  a?.author.kind === b?.author.kind &&
  a?.author.id === b?.author.id &&
  a?.author.name === b?.author.name &&
  a?.createdAt === b?.createdAt &&
  a?.body === b?.body;

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
/**
 * @cc [owner:tdraier,label:security] document-comment-verification
 * With a verifier, each message MUST read as verified or unverified from the current verifier's
 * answer for the threads currently shown, and as unknown while that answer is pending. Without a
 * verifier, every message MUST read as unknown, never as verified.
 */
export const useDocumentComments = ({
  editor,
  canComment,
  author,
  isSavable,
  sign,
  verify,
}: UseDocumentCommentsProps) => {
  const { t } = useLingui();
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
  // Selected apart so the threads keep their identity while only the selection or draft moves.
  const comments =
    useEditorState({
      editor,
      selector: ({ editor }): DfmComment[] =>
        editor ? getDocumentComments(editor.state.doc) : EMPTY_COMMENTS,
    }) ?? EMPTY_COMMENTS;
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<PanelFocusRequest | null>(
    null
  );
  const [verification, setVerification] = useState<Verification | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const canWrite = canComment && author !== undefined;
  // Stable identity matters: the markers re-measure the DOM whenever this array changes.
  const unresolved = useMemo(
    () => comments.filter((comment) => comment.status === "open"),
    [comments]
  );

  // Signature checks are asynchronous WebCrypto calls; results are kept with the threads they
  // checked, so an edit never shows a stale answer.
  useEffect(() => {
    if (!verify) {
      return;
    }
    let cancelled = false;
    void concurrentExecutor(
      comments.flatMap((comment) =>
        comment.messages.map((_, index) => ({ comment, index }))
      ),
      async ({ comment, index }) =>
        [
          `${comment.id}:${index}`,
          await verify(comment.id, comment.messages, index),
        ] as const,
      { concurrency: 8 }
    ).then((entries) => {
      if (!cancelled) {
        setVerification({ comments, verify, results: new Map(entries) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [comments, verify]);

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

  /**
   * The message to add to `thread`, or to a new thread `commentId`: checked against the codec
   * locally first, then written by the server when a signer is set and checked again as written.
   */
  const writeMessage = async (
    writer: DfmAuthor,
    commentId: string,
    thread: DfmComment | undefined,
    body: string
  ): Promise<Result<DfmMessage, string>> => {
    const withMessage = (added: DfmMessage): DfmComment =>
      thread
        ? { ...thread, messages: [...thread.messages, added] }
        : { id: commentId, status: "open", messages: [added] };
    const local: DfmMessage = {
      author: writer,
      createdAt: new Date().toISOString(),
      body,
    };
    if (!isWritableThread(withMessage(local))) {
      return new Err(t(UNSAVABLE_MESSAGE));
    }
    if (!sign) {
      return new Ok(local);
    }
    const signed = await sign(commentId, thread?.messages ?? [], body);
    if (signed.isOk() && !isWritableThread(withMessage(signed.value))) {
      return new Err(t(UNSAVABLE_MESSAGE));
    }
    return signed;
  };

  return {
    /** Whether a message's signature checked out, or null while unknown. */
    isVerified: (commentId: string, index: number): boolean | null =>
      verify &&
      verification?.comments === comments &&
      verification.verify === verify
        ? (verification.results.get(`${commentId}:${index}`) ?? null)
        : null,
    comments,
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
    submitDraft: async (body: string): Promise<Result<void, string>> => {
      if (!canWrite || !editor || !author || !state.draft) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const id = crypto.randomUUID();
      const written = await writeMessage(author, id, undefined, body);
      if (written.isErr()) {
        return written;
      }
      if (!editor.isEditable) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const comment: DfmComment = {
        id,
        status: "open",
        messages: [written.value],
      };
      // The draft may have moved, or been cancelled, while the server signed the message.
      const draft = documentCommentsPluginKey.getState(editor.state)?.draft;
      const next = draft
        ? previewDocument(editor, (chain) => chain.addComment(comment))
        : null;
      if (!draft || !next) {
        return new Err(t(UNANCHORED_MESSAGE));
      }
      if (!isSavable(next.toJSON())) {
        return new Err(t(UNSAVABLE_MESSAGE));
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
    reply: async (id: string, body: string): Promise<Result<void, string>> => {
      const thread = comments.find((comment) => comment.id === id);
      if (!canWrite || !editor || !author || !thread) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const written = await writeMessage(author, id, thread, body);
      if (written.isErr()) {
        return written;
      }
      if (!editor.isEditable) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      // The reply is signed after the thread's last message; it must still follow that one.
      const current = getDocumentComments(editor.state.doc).find(
        (comment) => comment.id === id
      );
      if (!current) {
        return new Err(t`This comment was deleted.`);
      }
      if (
        current.messages.length !== thread.messages.length ||
        !sameMessage(current.messages.at(-1), thread.messages.at(-1))
      ) {
        return new Err(t`This thread changed while sending. Send again.`);
      }
      const next = previewDocument(editor, (chain) =>
        chain.replyToComment(id, written.value)
      );
      if (!next) {
        return new Err(t`This comment was deleted.`);
      }
      if (!isSavable(next.toJSON())) {
        return new Err(t(UNSAVABLE_MESSAGE));
      }
      editor.commands.replyToComment(id, written.value);
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
