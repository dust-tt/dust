import {
  parseInlineMarkdown,
  serializeInlineMarkdown,
} from "@app/components/editor/document/content";
import { isWritableThread } from "@app/components/editor/document/dfm_persistence";
import type { DocumentCommentDraft } from "@app/components/editor/document/DocumentComments";
import {
  documentCommentsPluginKey,
  getClickedCommentIds,
  getCommentedTexts,
  getCommentInlineContent,
  getCommentStarts,
  getDocumentComments,
  getDraftInlineContent,
  getSuggestableCommentIds,
  scrollToCommentHighlight,
  withoutOrphanCommentMarks,
} from "@app/components/editor/document/DocumentComments";
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { suggestionBlock } from "@app/lib/markdown/dfm";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  LiveCommentCommand,
  LiveCommentErrorCode,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ChainedCommands, Editor, JSONContent } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

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
  live?: LiveCommentChannel;
}

interface Verification {
  /** The verifier the results belong to; results from another are stale. */
  verify: DfmMessageVerifier;
  /** Whether each message verified, by `verificationKey`. */
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
  suggestable: Set<string>;
  draftSuggestable: boolean;
}

const EMPTY_COMMENTS: DfmComment[] = [];

const EMPTY_STATE: EditorCommentsState = {
  quotes: new Map(),
  starts: new Map(),
  activeId: null,
  draft: null,
  draftQuote: "",
  suggestable: new Set(),
  draftSuggestable: false,
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

/** The draft's text, shown as its quote and sent as the one agents get. */
const getDraftQuote = (doc: Node, draft: DocumentCommentDraft) =>
  doc.textBetween(draft.from, draft.to, " ");

const UNSUGGESTABLE_MESSAGE = msg`Suggestions can only replace text within one paragraph.`;
const UNAPPLICABLE_MESSAGE = msg`This suggestion can't replace the commented text. Another comment may cover part of it.`;
const DELETED_MESSAGE = msg`This comment was deleted.`;
const THREAD_CHANGED_MESSAGE = msg`This thread changed while sending. Send again.`;

const ED25519_BASE64URL_SIGNATURE_PLACEHOLDER = "A".repeat(86);

const withMessage = (
  commentId: string,
  thread: DfmComment | undefined,
  added: DfmMessage
): DfmComment =>
  thread
    ? { ...thread, messages: [...thread.messages, added] }
    : { id: commentId, status: "open", messages: [added] };

const localMessage = (writer: DfmAuthor, body: string): DfmMessage => ({
  author: writer,
  createdAt: new Date().toISOString(),
  body,
});

/** What a message's signature covers besides the file: its thread, place and previous message. */
const verificationKey = (comment: DfmComment, index: number) =>
  JSON.stringify([
    comment.id,
    index,
    comment.messages[index - 1] ?? null,
    comment.messages[index],
  ]);

/** Where comment changes go: the session when live, otherwise the document's threads. */
interface CommentCommands {
  add: (id: string, body: string) => Promise<Result<DfmComment, string>>;
  reply: (thread: DfmComment, body: string) => Promise<Result<void, string>>;
  setResolved: (id: string, resolved: boolean) => Promise<Result<void, string>>;
  remove: (id: string) => Promise<Result<void, string>>;
  /** Drops a thread `add` created that the draft could no longer anchor. */
  discard: (id: string) => void;
}

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

interface ThreadFailure {
  /** The thread as it was when refused; the refusal no longer applies once it changes. */
  comment: DfmComment;
  message: string;
}

/** Where the comments card or list should move focus once it has rendered. */
export interface CommentsFocusRequest {
  /** Thread to focus, or null for the list heading. */
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
 * comment from a highlight or marker MUST close the comments list, make the comment active so its
 * card floats under its text, and request focus on that thread. Opening the list from its toggle
 * MUST cancel a pending draft and request focus on the list. Starting a draft MUST close the list.
 * Closing the list while focus is inside it MUST return focus to the toggle. While a draft is
 * pending, revealing MUST NOT change the active comment, so the draft's card and its typed text
 * stay.
 */
/**
 * @cc [owner:tdraier,label:react] document-thread-actions
 * While a thread's resolve, reopen, delete or suggestion is pending, another of them on that
 * thread MUST be ignored, wherever it starts and even after the list or card that started it
 * closed. A refused one MUST read on the thread, with its reason, until the thread changes.
 */
/**
 * @cc [owner:tdraier,label:security] document-comment-verification
 * With a verifier, each message MUST read as verified or unverified from the current verifier's
 * answer for that message at its place in its thread after the same previous message, and as
 * unknown while that answer is pending. Without a verifier, every message MUST read as unknown,
 * never as verified.
 */
/**
 * @cc [owner:tdraier,label:product] document-comment-suggestion
 * Applying a suggestion MUST require canWrite and an open thread, MUST replace the commented text
 * with the suggestion's content, and only once that text change is in the document MUST it resolve
 * the thread outside text undo history; when that resolution is refused, the text change MUST stay
 * and the refusal MUST be returned with its reason. It MUST be refused with a reason, leaving the
 * document unchanged, when the text change is refused or filtered out, when the suggestion is not
 * one paragraph of inline Markdown, the commented text spans more than one textblock, or the
 * document would no longer save. A suggestion template MUST hold the current commented text as
 * Markdown, so applying it unchanged leaves the text as it is.
 */
/**
 * @cc [owner:tdraier,label:product] document-live-comment-commands
 * With `live`, posting, replying to, resolving and deleting comments MUST go through the session
 * and MUST NOT change the threads in the document, which only the session sends, with two
 * exceptions: a new thread MUST be anchored to the draft once the session created it, and deleting
 * MUST remove the comment's marks once the session deleted the thread or answered that it has none,
 * never before. A new thread MUST be deleted from the session instead when it can no longer be
 * anchored, or when the session accepted it without returning it or returned a thread the codec
 * cannot write. A new comment or reply the codec could not write, or the document would no longer
 * save with, MUST be refused before the session sees it, checked with the current author and a
 * full-length signature, and without the comment marks that have no thread, which the session drops
 * when it writes the file. Every refusal from the session, and a command that could not be sent,
 * MUST be returned with a reason, never thrown; applying a suggestion whose resolution the session
 * refuses MUST keep the text change and return that reason.
 */
export const useDocumentComments = ({
  editor,
  canComment,
  author,
  isSavable,
  sign,
  verify,
  live,
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
          draftQuote: draft ? getDraftQuote(editor.state.doc, draft) : "",
          suggestable: getSuggestableCommentIds(editor.state.doc),
          draftSuggestable: draft
            ? editor.state.doc
                .resolve(draft.from)
                .sameParent(editor.state.doc.resolve(draft.to))
            : false,
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
  const [listOpen, setListOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<CommentsFocusRequest | null>(
    null
  );
  const [verification, setVerification] = useState<Verification | null>(null);
  const pendingThreadIds = useRef(new Set<string>());
  const [busyThreadIds, setBusyThreadIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [threadFailures, setThreadFailures] = useState<
    ReadonlyMap<string, ThreadFailure>
  >(() => new Map());
  const latestComments = useRef(comments);
  const latestVerification = useRef<Verification | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const canWrite = canComment && author !== undefined;
  // Stable identity matters: the markers re-measure the DOM whenever this array changes.
  const unresolved = useMemo(
    () => comments.filter((comment) => comment.status === "open"),
    [comments]
  );

  // Signature checks are asynchronous WebCrypto calls; results are kept by what each signature
  // covers, so new threads only wait for the messages they changed.
  const verifiedByPosition = useMemo(() => {
    const results = new Map<string, boolean>();
    if (!verify || verification?.verify !== verify) {
      return results;
    }
    for (const comment of comments) {
      comment.messages.forEach((_, index) => {
        const valid = verification.results.get(verificationKey(comment, index));
        if (valid !== undefined) {
          results.set(`${comment.id}:${index}`, valid);
        }
      });
    }
    return results;
  }, [comments, verification, verify]);

  useEffect(() => {
    if (!verify) {
      return;
    }
    let cancelled = false;
    const known =
      latestVerification.current?.verify === verify
        ? latestVerification.current.results
        : null;
    void concurrentExecutor(
      comments.flatMap((comment) =>
        comment.messages.map((_, index) => ({ comment, index }))
      ),
      async ({ comment, index }) => {
        const key = verificationKey(comment, index);
        return [
          key,
          known?.get(key) ??
            (await verify(comment.id, comment.messages, index)),
        ] as const;
      },
      { concurrency: 8 }
    ).then((entries) => {
      if (!cancelled) {
        latestVerification.current = { verify, results: new Map(entries) };
        setVerification(latestVerification.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [comments, verify]);

  useEffect(() => {
    latestComments.current = comments;
  }, [comments]);

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
    if (state.draft) {
      return;
    }
    select(id);
    setListOpen(false);
    requestFocus(id);
  };

  const liveErrorMessage = (code: LiveCommentErrorCode): string => {
    switch (code) {
      case "unavailable":
        return t(UNAVAILABLE_MESSAGE);
      case "not_found":
        return t(DELETED_MESSAGE);
      case "thread_changed":
        return t(THREAD_CHANGED_MESSAGE);
      case "unwritable":
        return t(UNSAVABLE_MESSAGE);
      default:
        assertNeverAndIgnore(code);
        return t(UNAVAILABLE_MESSAGE);
    }
  };

  // A live document keeps marks whose thread is gone; the session drops them when it saves.
  const wouldSave = (document: Node): boolean => {
    const json = document.toJSON();
    return isSavable(
      live
        ? withoutOrphanCommentMarks(
            json,
            new Set(getDocumentComments(document).map(({ id }) => id))
          )
        : json
    );
  };

  const writtenAsChecked = !sign && !live;

  /**
   * Refuses a new message to `thread`, or a new thread `commentId`, before anyone writes it: when
   * the codec could not write it, or the document would no longer save with it. A message the
   * server writes is checked with a full-length signature.
   */
  const checkNewMessage = (
    editor: Editor,
    writer: DfmAuthor,
    commentId: string,
    thread: DfmComment | undefined,
    body: string
  ): Result<void, string> => {
    const local = localMessage(writer, body);
    const message = writtenAsChecked
      ? local
      : { ...local, signature: ED25519_BASE64URL_SIGNATURE_PLACEHOLDER };
    const added = withMessage(commentId, thread, message);
    if (!isWritableThread(added)) {
      return new Err(t(UNSAVABLE_MESSAGE));
    }
    const next = previewDocument(editor, (chain) =>
      thread
        ? chain.replyToComment(commentId, message)
        : chain.addComment(added)
    );
    if (!next) {
      return new Err(t(thread ? DELETED_MESSAGE : UNANCHORED_MESSAGE));
    }
    return wouldSave(next) ? new Ok(undefined) : new Err(t(UNSAVABLE_MESSAGE));
  };

  /**
   * The message to add to `thread`, or to a new thread `commentId`: written by the server when a
   * signer is set and checked again as written, otherwise built here.
   */
  const writeMessage = async (
    writer: DfmAuthor,
    commentId: string,
    thread: DfmComment | undefined,
    body: string
  ): Promise<Result<DfmMessage, string>> => {
    if (!sign) {
      return new Ok(localMessage(writer, body));
    }
    const signed = await sign(commentId, thread?.messages ?? [], body);
    if (
      signed.isOk() &&
      !isWritableThread(withMessage(commentId, thread, signed.value))
    ) {
      return new Err(t(UNSAVABLE_MESSAGE));
    }
    return signed;
  };

  const documentCommands = (
    editor: Editor,
    writer: DfmAuthor
  ): CommentCommands => ({
    add: async (id, body) => {
      const written = await writeMessage(writer, id, undefined, body);
      return written.isOk()
        ? new Ok({ id, status: "open", messages: [written.value] })
        : written;
    },
    reply: async (thread, body) => {
      const written = await writeMessage(writer, thread.id, thread, body);
      if (written.isErr()) {
        return written;
      }
      if (!editor.isEditable) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      // The reply is signed after the thread's last message; it must still follow that one.
      const current = getDocumentComments(editor.state.doc).find(
        (comment) => comment.id === thread.id
      );
      if (!current) {
        return new Err(t(DELETED_MESSAGE));
      }
      if (
        current.messages.length !== thread.messages.length ||
        !sameMessage(current.messages.at(-1), thread.messages.at(-1))
      ) {
        return new Err(t(THREAD_CHANGED_MESSAGE));
      }
      const next = previewDocument(editor, (chain) =>
        chain.replyToComment(thread.id, written.value)
      );
      if (!next) {
        return new Err(t(DELETED_MESSAGE));
      }
      if (!writtenAsChecked && !wouldSave(next)) {
        return new Err(t(UNSAVABLE_MESSAGE));
      }
      editor.commands.replyToComment(thread.id, written.value);
      return new Ok(undefined);
    },
    setResolved: async (id, resolved) => {
      editor.commands.setCommentResolved(id, resolved);
      return new Ok(undefined);
    },
    remove: async (id) => {
      editor.commands.deleteComment(id);
      return new Ok(undefined);
    },
    discard: () => undefined,
  });

  const sessionCommands = (
    editor: Editor,
    channel: LiveCommentChannel
  ): CommentCommands => {
    const sendForReason = async (
      command: LiveCommentCommand
    ): Promise<Result<void, string>> => {
      const sent = await channel.send(command);
      return sent.isOk()
        ? new Ok(undefined)
        : new Err(liveErrorMessage(sent.error));
    };
    // TODO(co-edition): a connection lost while the session stores an `add`, or before it hears
    // this delete, closes the channel, so the thread stays in the session without an anchor.
    const discard = (id: string) => {
      void channel.send({ type: "delete", commentId: id });
    };
    return {
      add: async (id, body) => {
        const draft = documentCommentsPluginKey.getState(editor.state)?.draft;
        const created = await channel.send({
          type: "add",
          commentId: id,
          body,
          quote: draft ? getDraftQuote(editor.state.doc, draft) : undefined,
        });
        if (created.isErr()) {
          return new Err(liveErrorMessage(created.error));
        }
        if (!created.value) {
          discard(id);
          return new Err(t(UNAVAILABLE_MESSAGE));
        }
        if (!isWritableThread(created.value)) {
          discard(id);
          return new Err(t(UNSAVABLE_MESSAGE));
        }
        return new Ok(created.value);
      },
      // The session refuses the reply once the thread has moved past what was shown.
      reply: (thread, body) =>
        sendForReason({
          type: "reply",
          commentId: thread.id,
          position: thread.messages.length,
          body,
        }),
      setResolved: (id, resolved) =>
        sendForReason({ type: "resolve", commentId: id, resolved }),
      // A thread already gone is what a delete asks for.
      remove: async (id) => {
        const deleted = await channel.send({
          type: "delete",
          commentId: id,
        });
        if (deleted.isErr() && deleted.error !== "not_found") {
          return new Err(liveErrorMessage(deleted.error));
        }
        editor.commands.removeCommentMarks(id);
        return new Ok(undefined);
      },
      discard,
    };
  };

  const commandsFor = (editor: Editor, writer: DfmAuthor): CommentCommands =>
    live ? sessionCommands(editor, live) : documentCommands(editor, writer);

  /** Anchors a created thread to the draft. */
  const anchorToDraft = (
    editor: Editor,
    comment: DfmComment
  ): Result<void, string> => {
    if (!editor.isEditable) {
      return new Err(t(UNAVAILABLE_MESSAGE));
    }
    const draft = documentCommentsPluginKey.getState(editor.state)?.draft;
    const next = draft
      ? previewDocument(editor, (chain) => chain.addComment(comment))
      : null;
    if (!draft || !next) {
      return new Err(t(UNANCHORED_MESSAGE));
    }
    if (!writtenAsChecked && !wouldSave(next)) {
      return new Err(t(UNSAVABLE_MESSAGE));
    }
    editor.chain().addComment(comment).focus().setTextSelection(draft.to).run();
    return new Ok(undefined);
  };

  const suggestionTemplate = (
    content: JSONContent[] | null
  ): Result<string, string> => {
    if (!content) {
      return new Err(t(UNSUGGESTABLE_MESSAGE));
    }
    const markdown = serializeInlineMarkdown(content);
    if (markdown.isErr()) {
      return markdown;
    }
    const block = suggestionBlock(markdown.value);
    return block.isOk()
      ? block
      : new Err(t`This text is too long or complex to suggest a change to.`);
  };

  const recordThreadResult = (id: string, done: Result<void, string>) =>
    setThreadFailures((current) => {
      const next = new Map(current);
      // Keyed to the thread as it is now: a suggestion changes the document before it is refused.
      const comment = latestComments.current.find((thread) => thread.id === id);
      if (done.isErr() && comment) {
        next.set(id, { comment, message: done.error });
      } else {
        next.delete(id);
      }
      return next;
    });

  return {
    /** Whether a message's signature checked out, or null while unknown. */
    isVerified: (commentId: string, index: number): boolean | null =>
      verifiedByPosition.get(`${commentId}:${index}`) ?? null,
    comments,
    unresolved,
    quotes: state.quotes,
    starts: state.starts,
    activeId: state.activeId,
    draft: canWrite ? state.draft : null,
    draftQuote: state.draftQuote,
    canWrite,
    author,
    listOpen,
    /** Threads with a resolve, reopen, delete or suggestion pending. */
    busyThreadIds,
    /** The reason the thread's last action was refused, until the thread changes. */
    threadError: (comment: DfmComment): string | null => {
      const failure = threadFailures.get(comment.id);
      return failure?.comment === comment ? failure.message : null;
    },
    /**
     * Runs a resolve, reopen, delete or suggestion on a thread, unless one is pending on it.
     * Resolves to null for an ignored action.
     */
    runThreadAction: async (
      id: string,
      action: () => Promise<Result<void, string>>
    ): Promise<Result<void, string> | null> => {
      if (pendingThreadIds.current.has(id)) {
        return null;
      }
      pendingThreadIds.current.add(id);
      setBusyThreadIds(new Set(pendingThreadIds.current));
      try {
        const done = await action();
        recordThreadResult(id, done);
        return done;
      } finally {
        pendingThreadIds.current.delete(id);
        setBusyThreadIds(new Set(pendingThreadIds.current));
      }
    },
    focusRequest,
    toggleRef,
    listRef,
    select,
    closeList: () => {
      if (listRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setListOpen(false);
    },
    toggleList: () => {
      if (!listOpen) {
        if (state.draft) {
          editor?.commands.cancelCommentDraft();
        }
        requestFocus(null);
      }
      setListOpen((open) => !open);
    },
    /** Floats a comment's card under its text, from a highlight or marker. */
    reveal,
    /** Clears the active comment, closing its card, and hands focus back to the text. */
    closeThread: () => {
      select(null);
      editor?.commands.focus();
    },
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
    /** Activates a thread from the list and scrolls to its text. */
    jumpTo: (id: string) => {
      select(id);
      if (editor) {
        scrollToCommentHighlight(editor, id);
      }
    },
    /** Starts a comment on the selection, in a card floating under it. */
    startDraft: () => {
      if (!canWrite || !editor || !editor.commands.startCommentDraft()) {
        return false;
      }
      // The draft card takes focus; an older request would steal it.
      setFocusRequest(null);
      setListOpen(false);
      return true;
    },
    cancelDraft: () => {
      editor?.chain().cancelCommentDraft().focus().run();
    },
    submitDraft: async (body: string): Promise<Result<void, string>> => {
      if (!canWrite || !editor || !author || !state.draft) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const id = uuidv4();
      const checked = checkNewMessage(editor, author, id, undefined, body);
      if (checked.isErr()) {
        return checked;
      }
      const commands = commandsFor(editor, author);
      const created = await commands.add(id, body);
      if (created.isErr()) {
        return created;
      }
      // The draft may have moved, or been cancelled, while the server signed the message.
      const anchored = anchorToDraft(editor, created.value);
      if (anchored.isErr()) {
        // The session already holds the thread; without its anchor, it goes.
        commands.discard(id);
        return anchored;
      }
      return new Ok(undefined);
    },
    reply: async (id: string, body: string): Promise<Result<void, string>> => {
      const thread = comments.find((comment) => comment.id === id);
      if (!canWrite || !editor || !author || !thread) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const checked = checkNewMessage(editor, author, id, thread, body);
      if (checked.isErr()) {
        return checked;
      }
      return commandsFor(editor, author).reply(thread, body);
    },
    /** Resolves or reopens, then focuses the given thread or the list heading. */
    setResolved: async (
      id: string,
      resolved: boolean,
      focusNext: string | null
    ): Promise<Result<void, string>> => {
      if (!canWrite || !editor || !author) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const done = await commandsFor(editor, author).setResolved(id, resolved);
      if (done.isOk()) {
        requestFocus(focusNext);
      }
      return done;
    },
    suggestable: state.suggestable,
    draftSuggestable: canWrite && state.draftSuggestable,
    /** A suggestion block holding the commented text, for the field to edit. */
    suggestionTemplate: (id: string): Result<string, string> =>
      editor
        ? suggestionTemplate(getCommentInlineContent(editor.state.doc, id))
        : new Err(t(UNAVAILABLE_MESSAGE)),
    draftSuggestionTemplate: (): Result<string, string> => {
      const draft = editor
        ? documentCommentsPluginKey.getState(editor.state)?.draft
        : null;
      return editor && draft
        ? suggestionTemplate(getDraftInlineContent(editor.state.doc, draft))
        : new Err(t(UNAVAILABLE_MESSAGE));
    },
    /** Replaces the commented text with the suggestion, then resolves the thread. */
    applySuggestion: async (
      id: string,
      suggestion: string,
      focusNext: string | null
    ): Promise<Result<void, string>> => {
      const thread = editor
        ? getDocumentComments(editor.state.doc).find(
            (comment) => comment.id === id
          )
        : undefined;
      if (!canWrite || !editor || !author || thread?.status !== "open") {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const content = parseInlineMarkdown(suggestion);
      if (content.isErr()) {
        return content;
      }
      const next = previewDocument(editor, (chain) =>
        chain
          .applyCommentSuggestion(id, content.value)
          .setCommentResolved(id, true)
      );
      if (!next) {
        return new Err(
          getSuggestableCommentIds(editor.state.doc).has(id)
            ? t(UNAPPLICABLE_MESSAGE)
            : t(UNSUGGESTABLE_MESSAGE)
        );
      }
      if (!wouldSave(next)) {
        return new Err(t`This suggestion can't be saved in this document.`);
      }
      // Two transactions: the text change is undoable, the resolution stays out of history.
      const before = editor.state.doc;
      if (
        !editor.commands.applyCommentSuggestion(id, content.value) ||
        editor.state.doc === before
      ) {
        return new Err(t(UNAPPLICABLE_MESSAGE));
      }
      const resolved = await commandsFor(editor, author).setResolved(id, true);
      if (resolved.isErr()) {
        const reason = resolved.error;
        return new Err(
          t`The suggestion was applied, but the comment couldn't be resolved. ${reason}`
        );
      }
      requestFocus(focusNext);
      return new Ok(undefined);
    },
    /** Deletes, then focuses the given thread or the list heading. */
    remove: async (
      id: string,
      focusNext: string | null
    ): Promise<Result<void, string>> => {
      if (!canWrite || !editor || !author) {
        return new Err(t(UNAVAILABLE_MESSAGE));
      }
      const done = await commandsFor(editor, author).remove(id);
      if (done.isOk()) {
        requestFocus(focusNext);
      }
      return done;
    },
  };
};

export type DocumentCommentsController = ReturnType<typeof useDocumentComments>;
