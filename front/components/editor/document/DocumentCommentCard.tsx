import type { RenderAuthorAvatar } from "@app/components/editor/document/DocumentCommentThread";
import {
  DocumentCommentDraftCard,
  DocumentCommentThread,
} from "@app/components/editor/document/DocumentCommentThread";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { useEditorLayoutVersion } from "@app/components/editor/document/useEditorLayoutVersion";
import { cn } from "@dust-tt/sparkle";
import type { Editor, Extensions } from "@tiptap/core";
import type { ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const CARD_WIDTH_PX = 320;
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
 * `document-comment-input`), which MUST cancel the draft; a pointer press elsewhere MUST NOT, so
 * typed text survives a stray click. Enter MUST submit the trimmed Markdown, outside a list item.
 * A refused submission MUST keep the typed text and show the reason.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-card
 * While the comments list is closed and no draft is pending, the active thread MUST float in a
 * card under its highlighted text, with every message, and nothing MUST float for a thread
 * without highlighted text. Reply and moderation controls MUST render only when canWrite. Close,
 * or Escape outside a field, MUST clear the active thread and return focus to the editor; so MUST
 * resolving or deleting it from the card. Escape inside a reply field MUST NOT close the card;
 * when the field hands it to its onCancel, the field MUST be cleared and focus MUST return to the
 * thread. A refused action MUST show the reason on the thread until it changes.
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
    quotes,
    activeId,
    canWrite,
    listOpen,
    focusRequest,
    draft,
    draftSuggestable,
    draftSuggestionTemplate,
    suggestable,
    suggestionTemplate,
    submitDraft,
    cancelDraft,
    closeThread,
    reply,
    setResolved,
    remove,
    applySuggestion,
    isVerified,
  } = comments;
  const thread =
    draft || listOpen
      ? undefined
      : threads.find((comment) => comment.id === activeId);
  const showsDraft = draft !== null && !listOpen;
  const anchorId = showsDraft ? null : (thread?.id ?? undefined);
  const layoutVersion = useEditorLayoutVersion(editor, containerRef);
  const [position, setPosition] = useState<CardPosition | null>(null);
  const threadRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    setPosition(
      container && anchorId !== undefined
        ? measurePosition(editor, anchorId, container)
        : null
    );
  }, [editor, containerRef, anchorId, draft, layoutVersion]);

  const threadId = thread?.id;
  const positioned = position !== null;
  useEffect(() => {
    if (positioned && threadId && focusRequest?.threadId === threadId) {
      threadRef.current?.focus();
    }
  }, [focusRequest, threadId, positioned]);

  if (!position || (!showsDraft && !thread)) {
    return null;
  }

  const canSuggest =
    thread !== undefined &&
    canWrite &&
    thread.status === "open" &&
    suggestable.has(thread.id);

  return (
    <div
      data-document-comment-card=""
      className={cn(
        "absolute z-20 flex flex-col rounded-2xl border border-border bg-background p-3 font-sans text-foreground shadow-xl antialiased print:hidden",
        "dark:bg-muted-background"
      )}
      style={{ top: position.top, left: position.left, width: position.width }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && thread && !event.defaultPrevented) {
          event.preventDefault();
          closeThread();
        }
      }}
    >
      {showsDraft ? (
        <DocumentCommentDraftCard
          onSubmit={submitDraft}
          onCancel={cancelDraft}
          onSuggest={draftSuggestable ? draftSuggestionTemplate : undefined}
          inputExtensions={commentInputExtensions}
          mountPortalContainer={mountPortalContainer}
        />
      ) : (
        thread && (
          <DocumentCommentThread
            key={thread.id}
            variant="card"
            comment={thread}
            quote={quotes.get(thread.id)}
            active
            canWrite={canWrite}
            isVerified={(index) => isVerified(thread.id, index)}
            onReply={(body) => reply(thread.id, body)}
            onSetResolved={async (value) => {
              const done = await setResolved(thread.id, value, null);
              if (done.isOk() && value) {
                closeThread();
              }
              return done;
            }}
            onDelete={async () => {
              const done = await remove(thread.id, null);
              if (done.isOk()) {
                closeThread();
              }
              return done;
            }}
            onClose={closeThread}
            onElement={(element) => {
              threadRef.current = element;
            }}
            renderAuthorAvatar={renderAuthorAvatar}
            renderBody={renderCommentBody}
            inputExtensions={commentInputExtensions}
            onSuggest={
              canSuggest ? () => suggestionTemplate(thread.id) : undefined
            }
            onApplySuggestion={
              canSuggest
                ? async (suggestion) => {
                    const done = await applySuggestion(
                      thread.id,
                      suggestion,
                      null
                    );
                    if (done.isOk()) {
                      closeThread();
                    }
                    return done;
                  }
                : undefined
            }
            mountPortalContainer={mountPortalContainer}
          />
        )
      )}
    </div>
  );
};
