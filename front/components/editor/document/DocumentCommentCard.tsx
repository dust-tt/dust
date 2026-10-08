import type { DocumentCommentDraft } from "@app/components/editor/document/DocumentComments";
import type { RenderAuthorAvatar } from "@app/components/editor/document/DocumentCommentThread";
import {
  DocumentCommentDraftCard,
  DocumentCommentThread,
} from "@app/components/editor/document/DocumentCommentThread";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { useEditorLayoutVersion } from "@app/components/editor/document/useEditorLayoutVersion";
import {
  presenceClass,
  usePresence,
} from "@app/components/editor/document/usePresence";
import type { DfmComment } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { cn } from "@dust-tt/sparkle";
import type { Editor, Extensions } from "@tiptap/core";
import type { ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const CARD_WIDTH_PX = 320;
const DRAFT = "draft";
const GAP_PX = 8;

interface CardPosition {
  top: number;
  left: number;
  width: number;
}

/** The rendered pieces of the draft, or of a comment's highlight, in document order. */
const anchorElements = (editor: Editor, commentId: string | null) =>
  Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>(
      commentId === null ? "[data-comment-draft]" : "[data-comment-highlight]"
    )
  ).filter(
    (element) =>
      commentId === null || element.dataset.commentHighlight === commentId
  );

/** Under the anchor's last line, from its first character, kept inside the text column. */
const measurePosition = (
  editor: Editor,
  commentId: string | null,
  container: HTMLElement
): CardPosition | null => {
  const elements = anchorElements(editor, commentId);
  const last = elements.at(-1);
  if (!last) {
    return null;
  }
  const box = container.getBoundingClientRect();
  const style = getComputedStyle(container);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const start =
    elements[0].getClientRects()[0] ?? elements[0].getBoundingClientRect();
  const lines = last.getClientRects();
  const end = lines[lines.length - 1] ?? last.getBoundingClientRect();
  const width = Math.min(CARD_WIDTH_PX, box.width - paddingLeft - paddingRight);
  const maxLeft = Math.max(paddingLeft, box.width - width - paddingRight);
  return {
    top: end.bottom - box.top + GAP_PX,
    left: Math.min(Math.max(start.left - box.left, paddingLeft), maxLeft),
    width,
  };
};

/**
 * Where the card floats under its anchor, re-measured as the layout changes. While `holding`, a
 * card whose anchor is gone stays where it last floated.
 */
const useCardPosition = (
  editor: Editor,
  containerRef: RefObject<HTMLElement | null>,
  anchorId: string | null | undefined,
  draft: DocumentCommentDraft | null,
  holding: boolean
) => {
  const layoutVersion = useEditorLayoutVersion(editor, containerRef);
  const [position, setPosition] = useState<CardPosition | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measured =
      container && anchorId !== undefined
        ? measurePosition(editor, anchorId, container)
        : null;
    setPosition((last) => measured ?? (holding ? last : null));
  }, [editor, containerRef, anchorId, draft, holding, layoutVersion]);

  return position;
};

interface FloatingThreadProps {
  thread: DfmComment;
  comments: DocumentCommentsController;
  renderCommentBody: (body: string) => ReactNode;
  commentInputExtensions?: Extensions;
  mountPortalContainer?: HTMLElement;
  renderAuthorAvatar: RenderAuthorAvatar;
  onElement: (element: HTMLElement | null) => void;
}

/** The active thread in the card; resolving, deleting or applying a suggestion closes it. */
const FloatingThread = ({
  thread,
  comments,
  renderCommentBody,
  commentInputExtensions,
  mountPortalContainer,
  renderAuthorAvatar,
  onElement,
}: FloatingThreadProps) => {
  const {
    quotes,
    canWrite,
    suggestable,
    suggestionTemplate,
    busyThreadIds,
    threadError,
    runThreadAction,
    closeThread,
    reply,
    setResolved,
    remove,
    applySuggestion,
    isVerified,
  } = comments;
  const canSuggest =
    canWrite && thread.status === "open" && suggestable.has(thread.id);
  const run = async (action: () => Promise<Result<void, string>>) => {
    const done = await runThreadAction(thread.id, action);
    if (done?.isOk()) {
      closeThread();
    }
  };

  return (
    <DocumentCommentThread
      variant="card"
      comment={thread}
      quote={quotes.get(thread.id)}
      active
      canWrite={canWrite}
      busy={busyThreadIds.has(thread.id)}
      error={threadError(thread)}
      isVerified={(index) => isVerified(thread.id, index)}
      onReply={(body) => reply(thread.id, body)}
      onSetResolved={(value) =>
        void runThreadAction(thread.id, () =>
          setResolved(thread.id, value, null)
        ).then((done) => {
          if (done?.isOk() && value) {
            closeThread();
          }
        })
      }
      onDelete={() => void run(() => remove(thread.id, null))}
      onClose={closeThread}
      onElement={onElement}
      renderAuthorAvatar={renderAuthorAvatar}
      renderBody={renderCommentBody}
      inputExtensions={commentInputExtensions}
      onSuggest={canSuggest ? () => suggestionTemplate(thread.id) : undefined}
      onApplySuggestion={
        canSuggest
          ? (suggestion) =>
              run(() => applySuggestion(thread.id, suggestion, null))
          : undefined
      }
      mountPortalContainer={mountPortalContainer}
    />
  );
};

interface DocumentCommentCardProps {
  editor: Editor;
  comments: DocumentCommentsController;
  /** The positioned element the editor renders in. */
  containerRef: RefObject<HTMLElement | null>;
  renderCommentBody: (body: string) => ReactNode;
  commentInputExtensions?: Extensions;
  mountPortalContainer?: HTMLElement;
  renderAuthorAvatar: RenderAuthorAvatar;
}

/**
 * @cc [owner:tdraier,label:react] document-comment-draft-card
 * While a draft is pending and the user can comment, a new comment card MUST float under the
 * draft's text, with its field focused. Escape in the field hands to its onCancel (see
 * `document-comment-input`), which MUST cancel the draft. A pointer press outside the card MUST
 * cancel the draft while its field holds no content, leaving focus where the press put it, and
 * MUST NOT once it does, so typed text survives a stray click. Enter MUST submit the trimmed
 * Markdown, outside a list item. A refused submission MUST keep the typed text and show the reason.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-card
 * While the comments list is closed and no draft is pending, the active thread MUST float in a
 * card under its highlighted text, with every message, and nothing MUST float for a thread
 * without highlighted text, unless an action on it is pending or its refusal shows: the card MUST
 * then stay where it last floated. Reply and moderation controls MUST render only when canWrite.
 * Close, or Escape outside a field, MUST clear the active thread and return focus to the editor;
 * so MUST resolving or deleting it from the card. Escape inside a reply field MUST NOT close the
 * card; when the field hands it to its onCancel, the field MUST be cleared and focus MUST return
 * to the thread. A refused action MUST show the reason on the thread until it changes.
 */
export const DocumentCommentCard = ({
  editor,
  comments,
  containerRef,
  renderCommentBody,
  commentInputExtensions,
  mountPortalContainer,
  renderAuthorAvatar,
}: DocumentCommentCardProps) => {
  const {
    comments: threads,
    activeId,
    listOpen,
    focusRequest,
    draft,
    draftSuggestable,
    draftSuggestionTemplate,
    submitDraft,
    cancelDraft,
    dismissDraft,
    closeThread,
    busyThreadIds,
    threadError,
  } = comments;
  const showsDraft = draft !== null && !listOpen;
  const thread =
    draft || listOpen
      ? undefined
      : threads.find((comment) => comment.id === activeId);
  const anchorId = showsDraft ? null : thread?.id;
  const holding =
    thread !== undefined &&
    (busyThreadIds.has(thread.id) || threadError(thread) !== null);
  const position = useCardPosition(
    editor,
    containerRef,
    anchorId,
    draft,
    holding
  );
  const threadRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Read on each press, so typing does not re-subscribe the listener below.
  const draftFilledRef = useRef(false);

  const target: typeof DRAFT | DfmComment | undefined = showsDraft
    ? DRAFT
    : thread;
  const visible = useMemo(
    () => (target && position ? { target, position } : null),
    [target, position]
  );
  // Once closed, the card keeps its last thread and place while it animates out.
  const { shown, open } = usePresence(visible);

  const threadId = thread?.id;
  useEffect(() => {
    if (open && threadId && focusRequest?.threadId === threadId) {
      threadRef.current?.focus();
    }
  }, [focusRequest, threadId, open]);

  const draftOpen = showsDraft && open;
  useEffect(() => {
    if (!draftOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const inside =
        event.target instanceof Node && cardRef.current?.contains(event.target);
      if (!inside && !draftFilledRef.current) {
        dismissDraft();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [draftOpen, dismissDraft]);

  if (!shown) {
    return null;
  }

  return (
    <div
      ref={cardRef}
      data-document-comment-card=""
      data-document-layer={open ? "" : undefined}
      data-state={open ? "open" : "closed"}
      aria-hidden={!open || undefined}
      className={cn(
        "absolute z-20 flex origin-top flex-col rounded-2xl border border-border bg-background p-3 font-sans text-foreground shadow-xl antialiased print:hidden",
        "dark:bg-muted-background",
        presenceClass(open)
      )}
      style={{
        top: shown.position.top,
        left: shown.position.left,
        width: shown.position.width,
      }}
    >
      {shown.target === DRAFT ? (
        <DocumentCommentDraftCard
          onSubmit={submitDraft}
          onCancel={cancelDraft}
          onFilledChange={(filled) => {
            draftFilledRef.current = filled;
          }}
          onSuggest={draftSuggestable ? draftSuggestionTemplate : undefined}
          inputExtensions={commentInputExtensions}
          mountPortalContainer={mountPortalContainer}
        />
      ) : (
        <FloatingThread
          key={shown.target.id}
          thread={shown.target}
          comments={comments}
          renderCommentBody={renderCommentBody}
          commentInputExtensions={commentInputExtensions}
          mountPortalContainer={mountPortalContainer}
          renderAuthorAvatar={renderAuthorAvatar}
          onElement={(element) => {
            threadRef.current = element;
          }}
        />
      )}
    </div>
  );
};
