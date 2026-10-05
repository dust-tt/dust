import { DocumentCommentInput } from "@app/components/editor/document/DocumentCommentInput";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { formatRelativeTime } from "@app/lib/client/relative_time";
import { formatDateTime } from "@app/lib/i18n/format";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import {
  Avatar,
  Button,
  Check,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Icon,
  MessageTextCircle01,
  ReverseLeft,
  Tooltip,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";

interface PanelIconButtonProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  mountPortalContainer?: HTMLElement;
}

const PanelIconButton = ({
  label,
  icon,
  onClick,
  mountPortalContainer,
}: PanelIconButtonProps) => (
  <Tooltip
    label={label}
    tooltipTriggerAsChild
    mountPortalContainer={mountPortalContainer}
    trigger={
      <button
        type="button"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <Icon visual={icon} size="xs" />
      </button>
    }
  />
);

interface MessageBylineProps {
  message: DfmMessage;
  size: "xxs" | "3xs";
}

const MessageByline = ({ message, size }: MessageBylineProps) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <span aria-hidden="true">
      <Avatar size={size} isRounded name={message.author.name} />
    </span>
    <span className="min-w-0 truncate text-sm font-medium">
      {message.author.name}
    </span>
    <time
      dateTime={message.createdAt}
      title={formatDateTime(new Date(message.createdAt))}
      className="shrink-0 text-xs text-muted-foreground"
    >
      {formatRelativeTime(new Date(message.createdAt))}
    </time>
  </div>
);

interface ReplyComposerProps {
  author: DfmAuthor | undefined;
  onReply: (body: string) => Result<void, string>;
  /** Escape clears the field and hands focus back to the thread. */
  onCancel: () => void;
}

const ReplyComposer = ({ author, onReply, onCancel }: ReplyComposerProps) => {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <DocumentCommentInput
      label="Reply"
      placeholder="Reply…"
      author={author}
      value={body}
      onChange={setBody}
      onSubmit={(trimmed) => {
        const replied = onReply(trimmed);
        if (replied.isErr()) {
          setError(replied.error);
          return;
        }
        setError(null);
        setBody("");
      }}
      onCancel={() => {
        setBody("");
        setError(null);
        onCancel();
      }}
      error={error}
      className="-mb-1 border-t border-border pt-2"
    />
  );
};

interface CommentThreadProps {
  comment: DfmComment;
  quote: string | undefined;
  active: boolean;
  canWrite: boolean;
  author: DfmAuthor | undefined;
  onSelect: () => void;
  onReply: (body: string) => Result<void, string>;
  onSetResolved: (resolved: boolean) => void;
  onDelete: () => void;
  onElement: (element: HTMLElement | null) => void;
  mountPortalContainer?: HTMLElement;
}

const CommentThread = ({
  comment,
  quote,
  active,
  canWrite,
  author,
  onSelect,
  onReply,
  onSetResolved,
  onDelete,
  onElement,
  mountPortalContainer,
}: CommentThreadProps) => {
  const ref = useRef<HTMLElement | null>(null);
  const [first, ...replies] = comment.messages;
  const resolved = comment.status === "resolved";

  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  return (
    <article
      ref={(element) => {
        ref.current = element;
        onElement(element);
      }}
      tabIndex={-1}
      aria-label={`Comment by ${first.author.name}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-xl border border-border bg-background transition-colors motion-reduce:transition-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-golden-500/60 ring-1 ring-golden-500/40"
          : "hover:border-border-dark",
        resolved && "bg-muted-background"
      )}
    >
      {/* Only catches clicks bubbling from the card; the quoted text is its keyboard control. */}
      <div
        role="presentation"
        onClick={onSelect}
        className="flex cursor-pointer flex-col gap-2.5 p-3"
      >
        <header className="flex items-center gap-1">
          <MessageByline message={first} size="xxs" />
          {canWrite && (
            <div className="-mr-1.5 flex shrink-0">
              <PanelIconButton
                label={resolved ? "Reopen" : "Resolve"}
                icon={resolved ? ReverseLeft : Check}
                onClick={() => onSetResolved(!resolved)}
                mountPortalContainer={mountPortalContainer}
              />
              <PanelIconButton
                label="Delete comment"
                icon={Trash01}
                onClick={onDelete}
                mountPortalContainer={mountPortalContainer}
              />
            </div>
          )}
        </header>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          className={cn(
            "line-clamp-2 rounded-r-md border-l-2 border-golden-400 py-0.5 pl-2 text-left text-xs text-muted-foreground",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            resolved && "line-through decoration-muted-foreground/60"
          )}
        >
          <span className="sr-only">Commented text: </span>
          {quote || "The commented text was removed."}
        </button>
        <p className="text-sm whitespace-pre-wrap wrap-anywhere">
          {first.body}
        </p>
        {replies.length > 0 && (
          <ul className="flex flex-col gap-2.5 border-l border-border pl-3">
            {replies.map((reply, index) => (
              <li
                key={`${reply.createdAt}:${index}`}
                className="flex flex-col gap-1"
              >
                <MessageByline message={reply} size="3xs" />
                <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                  {reply.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canWrite && active && !resolved && (
          <ReplyComposer
            author={author}
            onReply={onReply}
            onCancel={() => ref.current?.focus()}
          />
        )}
      </div>
    </article>
  );
};

interface DocumentCommentsPanelProps {
  id: string;
  comments: DocumentCommentsController;
  mountPortalContainer?: HTMLElement;
}

/** The thread to focus after removing one from its list: the next, else the previous. */
const neighbourId = (list: DfmComment[], id: string): string | null => {
  const index = list.findIndex((comment) => comment.id === id);
  return (list[index + 1] ?? list[index - 1])?.id ?? null;
};

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comments-panel
 * The panel MUST list open threads in document order, then resolved threads in a collapsed
 * group. Reply and moderation controls MUST render only when canWrite, and replies only on the
 * active open thread. Escape inside a reply field MUST clear it and return focus to its
 * thread, not close the panel. After resolving, reopening or deleting a thread, focus MUST
 * move to a neighbouring thread or to the panel heading. Opening or closing the panel MUST NOT
 * change the document.
 */
export const DocumentCommentsPanel = ({
  id,
  comments,
  mountPortalContainer,
}: DocumentCommentsPanelProps) => {
  const {
    comments: threads,
    quotes,
    activeId,
    canWrite,
    author,
    panelOpen,
    focusRequest,
    panelRef,
    closePanel,
    jumpTo,
    reply,
    setResolved,
    remove,
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

  useEffect(() => {
    if (!panelOpen || !focusRequest) {
      return;
    }
    const thread = focusRequest.threadId
      ? threadElements.current.get(focusRequest.threadId)
      : undefined;
    (thread ?? headingRef.current)?.focus();
  }, [panelOpen, focusRequest]);

  const renderThread = (comment: DfmComment) => {
    const siblings = comment.status === "resolved" ? resolved : unresolved;
    return (
      <CommentThread
        key={comment.id}
        comment={comment}
        quote={quotes.get(comment.id)}
        active={comment.id === activeId}
        canWrite={canWrite}
        author={author}
        onSelect={() => jumpTo(comment.id)}
        onReply={(body) => reply(comment.id, body)}
        onSetResolved={(value) =>
          setResolved(comment.id, value, neighbourId(siblings, comment.id))
        }
        onDelete={() => remove(comment.id, neighbourId(siblings, comment.id))}
        onElement={(element) => {
          if (element) {
            threadElements.current.set(comment.id, element);
          } else {
            threadElements.current.delete(comment.id);
          }
        }}
        mountPortalContainer={mountPortalContainer}
      />
    );
  };

  return (
    <aside
      id={id}
      ref={panelRef}
      aria-label="Comments"
      data-state={panelOpen ? "open" : "closed"}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closePanel();
        }
      }}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-80 max-w-[calc(100%-2rem)] flex-col border-l border-border bg-background/95 font-sans text-foreground antialiased shadow-xl backdrop-blur-xl print:hidden",
        // Visibility flips at once on open, so focus can land inside during the slide,
        // and only after the slide on close.
        "[transition-property:transform,visibility] [transition-duration:300ms,0s] ease-out-quint motion-reduce:transition-none",
        panelOpen
          ? "visible translate-x-0 [transition-delay:0s]"
          : "invisible translate-x-full [transition-delay:0s,300ms]"
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          aria-label={
            unresolved.length > 0
              ? `Comments, ${unresolved.length} unresolved`
              : "Comments"
          }
          className="rounded-md text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          Comments
          {unresolved.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {unresolved.length}
            </span>
          )}
        </h2>
        <PanelIconButton
          label="Close comments"
          icon={XClose}
          onClick={closePanel}
          mountPortalContainer={mountPortalContainer}
        />
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {threads.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <Icon visual={MessageTextCircle01} size="md" />
            <p className="text-sm font-medium text-foreground">
              No comments yet
            </p>
            <p className="text-xs">
              Select some text and choose Comment to start a thread.
            </p>
          </div>
        )}
        {unresolved.map(renderThread)}
        {resolved.length > 0 && (
          <Collapsible className="mt-1">
            <CollapsibleTrigger
              variant="secondary"
              label={`Resolved (${resolved.length})`}
            />
            <CollapsibleContent className="flex flex-col gap-3 pt-3">
              {resolved.map(renderThread)}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </aside>
  );
};

interface DocumentCommentsToggleProps {
  panelId: string;
  comments: DocumentCommentsController;
}

export const DocumentCommentsToggle = ({
  panelId,
  comments,
}: DocumentCommentsToggleProps) => {
  const unresolvedCount = comments.unresolved.length;
  return (
    <Button
      ref={comments.toggleRef}
      type="button"
      variant="ghost"
      size="xs"
      icon={MessageTextCircle01}
      label="Comments"
      aria-label={
        unresolvedCount > 0
          ? `Comments, ${unresolvedCount} unresolved`
          : "Comments"
      }
      isCounter={unresolvedCount > 0}
      counterValue={String(unresolvedCount)}
      aria-expanded={comments.panelOpen}
      aria-controls={panelId}
      onClick={comments.togglePanel}
    />
  );
};
