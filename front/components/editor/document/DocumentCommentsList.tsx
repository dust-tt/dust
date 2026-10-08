import type { RenderAuthorAvatar } from "@app/components/editor/document/DocumentCommentThread";
import { DocumentCommentThread } from "@app/components/editor/document/DocumentCommentThread";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import {
  presenceClass,
  usePresence,
} from "@app/components/editor/document/usePresence";
import type { DfmComment } from "@app/lib/markdown/dfm";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Icon,
  MessageCircle01,
  XClose,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Extensions } from "@tiptap/core";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

interface DocumentCommentsListProps {
  id: string;
  comments: DocumentCommentsController;
  renderCommentBody: (body: string) => ReactNode;
  commentInputExtensions?: Extensions;
  mountPortalContainer?: HTMLElement;
  renderAuthorAvatar: RenderAuthorAvatar;
}

/** The thread to focus after removing one from its list: the next, else the previous. */
const neighbourId = (list: DfmComment[], id: string): string | null => {
  const index = list.findIndex((comment) => comment.id === id);
  return (list[index + 1] ?? list[index - 1])?.id ?? null;
};

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comments-list
 * The comments list MUST stay pinned at the top right of the visible document while open, and
 * list open threads in document order, then resolved threads in a collapsed group. Each thread
 * MUST show its commented text and first message, and the active one MUST unfold in place with
 * every message. Reply and moderation controls MUST render only when canWrite, and replies only
 * on the active open thread. Escape inside a reply field MUST NOT close the list; when the field
 * hands it to its onCancel (see `document-comment-input`), the field MUST be cleared and focus
 * MUST return to its thread. After resolving, reopening or deleting a thread, focus MUST move to a
 * neighbouring thread or to the list heading; a refused one MUST show the reason on its thread
 * instead, until the thread changes (see `document-thread-actions`). While a thread's resolve,
 * reopen, delete or suggestion is pending, its controls MUST show it and further clicks on them
 * MUST be ignored, also after the list closes and reopens. Opening or closing the list MUST NOT
 * change the document.
 */
/**
 * @cc [owner:tdraier,label:react;performance] document-comment-avatars
 * The host's `renderAuthorAvatar` MUST be called only for messages shown in the floating card or
 * the open comments list, so avatars that load data load it only for threads on screen.
 */
export const DocumentCommentsList = ({
  id,
  comments,
  renderCommentBody,
  commentInputExtensions,
  mountPortalContainer,
  renderAuthorAvatar,
}: DocumentCommentsListProps) => {
  const { t } = useLingui();
  const {
    comments: threads,
    quotes,
    activeId,
    canWrite,
    listOpen,
    focusRequest,
    listRef,
    closeList,
    jumpTo,
    reply,
    setResolved,
    remove,
    isVerified,
    suggestable,
    suggestionTemplate,
    applySuggestion,
    busyThreadIds,
    threadError,
    runThreadAction,
  } = comments;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const threadElements = useRef(new Map<string, HTMLElement>());
  const order = new Map(
    Array.from(quotes.keys()).map((commentId, index) => [commentId, index])
  );
  const sorted = [...threads].sort(
    (a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
  const unresolved = sorted.filter((comment) => comment.status === "open");
  const resolved = sorted.filter((comment) => comment.status === "resolved");
  const unresolvedCount = unresolved.length;
  const resolvedCount = resolved.length;
  const { shown, open } = usePresence(listOpen || null);

  useEffect(() => {
    if (!listOpen || !focusRequest) {
      return;
    }
    const thread = focusRequest.threadId
      ? threadElements.current.get(focusRequest.threadId)
      : undefined;
    (thread ?? headingRef.current)?.focus({ preventScroll: true });
  }, [listOpen, focusRequest]);

  useEffect(() => {
    if (listOpen && activeId) {
      threadElements.current
        .get(activeId)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [listOpen, activeId]);

  if (!shown) {
    return null;
  }

  const renderThread = (comment: DfmComment) => {
    const siblings = comment.status === "resolved" ? resolved : unresolved;
    const canSuggest =
      canWrite && comment.status === "open" && suggestable.has(comment.id);
    return (
      <DocumentCommentThread
        key={comment.id}
        variant="list"
        comment={comment}
        quote={quotes.get(comment.id)}
        active={comment.id === activeId}
        canWrite={canWrite}
        busy={busyThreadIds.has(comment.id)}
        error={threadError(comment)}
        isVerified={(index) => isVerified(comment.id, index)}
        onSelect={() => jumpTo(comment.id)}
        onReply={(body) => reply(comment.id, body)}
        onSetResolved={(value) =>
          void runThreadAction(comment.id, () =>
            setResolved(comment.id, value, neighbourId(siblings, comment.id))
          )
        }
        onDelete={() =>
          void runThreadAction(comment.id, () =>
            remove(comment.id, neighbourId(siblings, comment.id))
          )
        }
        onElement={(element) => {
          if (element) {
            threadElements.current.set(comment.id, element);
          } else {
            threadElements.current.delete(comment.id);
          }
        }}
        renderAuthorAvatar={renderAuthorAvatar}
        renderBody={renderCommentBody}
        inputExtensions={commentInputExtensions}
        onSuggest={
          canSuggest ? () => suggestionTemplate(comment.id) : undefined
        }
        onApplySuggestion={
          canSuggest
            ? (suggestion) =>
                runThreadAction(comment.id, () =>
                  applySuggestion(
                    comment.id,
                    suggestion,
                    neighbourId(siblings, comment.id)
                  )
                )
            : undefined
        }
        mountPortalContainer={mountPortalContainer}
      />
    );
  };

  return (
    // The sticky strip keeps the list at the top of the scrolled document; it takes no room.
    <div className="pointer-events-none sticky top-0 z-40 h-0 print:hidden">
      <aside
        id={id}
        ref={listRef}
        aria-label={t`Comments`}
        aria-hidden={!open || undefined}
        data-state={open ? "open" : "closed"}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            closeList();
          }
        }}
        className={cn(
          "pointer-events-auto absolute right-0 top-2 flex max-h-[min(36rem,70vh)] w-[22.5rem] max-w-full flex-col overflow-hidden",
          "origin-top-right rounded-2xl border border-border bg-background font-sans text-foreground shadow-xl antialiased dark:bg-muted-background",
          presenceClass(open)
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border py-2.5 pl-4 pr-2">
          <h2
            ref={headingRef}
            tabIndex={-1}
            aria-label={
              unresolvedCount > 0
                ? t`Comments, ${plural(unresolvedCount, { one: "# unresolved", other: "# unresolved" })}`
                : t`Comments`
            }
            className="rounded-md text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trans>Comments</Trans>
          </h2>
          <Button
            size="xs"
            variant="ghost"
            icon={XClose}
            aria-label={t`Close comments`}
            onClick={closeList}
          />
        </header>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1">
          {unresolvedCount === 0 && (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <Icon
                visual={MessageCircle01}
                size="sm"
                className="text-muted-foreground"
              />
              <p className="text-sm font-medium text-foreground">
                <Trans>No comments yet</Trans>
              </p>
              <p className="text-sm text-muted-foreground">
                <Trans>Select text to add a comment.</Trans>
              </p>
            </div>
          )}
          {unresolved.map(renderThread)}
          {resolvedCount > 0 && (
            <Collapsible className="mt-1 border-t border-border px-1.5 pt-2">
              <CollapsibleTrigger
                variant="secondary"
                label={t`Resolved (${resolvedCount})`}
              />
              <CollapsibleContent className="flex flex-col gap-0.5 pt-2 opacity-80">
                {resolved.map(renderThread)}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </aside>
    </div>
  );
};

interface DocumentCommentsToggleProps {
  listId: string;
  comments: DocumentCommentsController;
  size: "xs" | "sm";
}

export const DocumentCommentsToggle = ({
  listId,
  comments,
  size,
}: DocumentCommentsToggleProps) => {
  const { t } = useLingui();
  const unresolvedCount = comments.unresolved.length;
  return (
    <Button
      ref={comments.toggleRef}
      type="button"
      variant={comments.listOpen ? "primary" : "ghost"}
      size={size}
      icon={MessageCircle01}
      label={unresolvedCount > 0 ? String(unresolvedCount) : undefined}
      tooltip={t`All comments`}
      aria-label={
        unresolvedCount > 0
          ? t`Comments, ${plural(unresolvedCount, { one: "# unresolved", other: "# unresolved" })}`
          : t`Comments`
      }
      aria-expanded={comments.listOpen}
      aria-controls={listId}
      onClick={comments.toggleList}
    />
  );
};
