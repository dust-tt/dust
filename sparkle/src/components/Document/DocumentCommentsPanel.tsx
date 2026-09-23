import { Avatar } from "@sparkle/components/Avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import {
  Check,
  MessageTextCircle01,
  ReverseLeft,
  Trash01,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { type ComponentType, useEffect, useRef, useState } from "react";
import { DocumentCommentInput } from "./DocumentCommentInput";
import type {
  DocumentComment,
  DocumentCommentAuthor,
  DocumentCommentReply,
} from "./types";
import type { DocumentCommentsController } from "./useDocumentComments";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

// Duplicates front's timeAgoFrom in spirit. Sparkle cannot import front, and no shared
// relative time helper exists in Sparkle yet. Promote to src/lib when a second component needs it.
export const formatCommentTime = (
  createdAt: string,
  now = Date.now()
): string => {
  const date = new Date(createdAt);
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return "";
  }

  const elapsed = now - time;
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (elapsed < MINUTE_MS) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    return relative.format(-Math.round(elapsed / MINUTE_MS), "minute");
  }
  if (elapsed < DAY_MS) {
    return relative.format(-Math.round(elapsed / HOUR_MS), "hour");
  }
  if (elapsed < WEEK_MS) {
    return relative.format(-Math.round(elapsed / DAY_MS), "day");
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date(now).getFullYear()
        ? undefined
        : "numeric",
  });
};

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

const CommentByline = ({
  author,
  createdAt,
  size,
}: Pick<DocumentCommentReply, "author" | "createdAt"> & {
  size: "xxs" | "3xs";
}) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <span aria-hidden="true">
      <Avatar
        size={size}
        isRounded
        name={author.name}
        visual={author.avatarUrl ?? undefined}
      />
    </span>
    <span className="min-w-0 truncate text-sm font-medium">{author.name}</span>
    <time
      dateTime={createdAt}
      title={new Date(createdAt).toLocaleString()}
      className="shrink-0 text-xs text-muted-foreground"
    >
      {formatCommentTime(createdAt)}
    </time>
  </div>
);

interface ReplyComposerProps {
  author: DocumentCommentAuthor | undefined;
  onReply: (body: string) => void;
  /** Escape clears the field and hands focus back to the thread. */
  onCancel: () => void;
}

const ReplyComposer = ({ author, onReply, onCancel }: ReplyComposerProps) => {
  const [body, setBody] = useState("");

  return (
    <DocumentCommentInput
      label="Reply"
      placeholder="Reply…"
      author={author}
      value={body}
      onChange={setBody}
      onSubmit={(trimmed) => {
        onReply(trimmed);
        setBody("");
      }}
      onCancel={() => {
        setBody("");
        onCancel();
      }}
      className="-mb-1 border-t border-border pt-2"
    />
  );
};

interface CommentThreadProps {
  comment: DocumentComment;
  quote: string | undefined;
  active: boolean;
  canWrite: boolean;
  author: DocumentCommentAuthor | undefined;
  onSelect: () => void;
  onReply: (body: string) => void;
  onSetResolved: (resolved: boolean) => void;
  onDelete: () => void;
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
  mountPortalContainer,
}: CommentThreadProps) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  return (
    <article
      ref={ref}
      tabIndex={-1}
      data-thread-id={comment.id}
      aria-label={`Comment by ${comment.author.name}`}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-background p-3 transition-colors motion-reduce:transition-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-golden-500/60 ring-1 ring-golden-500/40"
          : "hover:border-border-dark",
        comment.resolved && "bg-muted-background"
      )}
    >
      <header className="flex items-center gap-1">
        <CommentByline
          author={comment.author}
          createdAt={comment.createdAt}
          size="xxs"
        />
        {canWrite && (
          <div className="-mr-1.5 flex shrink-0">
            <PanelIconButton
              label={comment.resolved ? "Reopen" : "Resolve"}
              icon={comment.resolved ? ReverseLeft : Check}
              onClick={() => onSetResolved(!comment.resolved)}
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
          comment.resolved && "line-through decoration-muted-foreground/60"
        )}
      >
        <span className="sr-only">Commented text: </span>
        {quote || "The commented text was removed."}
      </button>
      <p className="text-sm whitespace-pre-wrap wrap-anywhere">
        {comment.body}
      </p>
      {comment.replies.length > 0 && (
        <ul className="flex flex-col gap-2.5 border-l border-border pl-3">
          {comment.replies.map((reply) => (
            <li key={reply.id} className="flex flex-col gap-1">
              <CommentByline
                author={reply.author}
                createdAt={reply.createdAt}
                size="3xs"
              />
              <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                {reply.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canWrite && active && !comment.resolved && (
        <ReplyComposer
          author={author}
          onReply={onReply}
          onCancel={() => ref.current?.focus()}
        />
      )}
    </article>
  );
};

interface DocumentCommentsPanelProps {
  id: string;
  comments: DocumentCommentsController;
  mountPortalContainer?: HTMLElement;
}

/** The thread to focus after removing one from its list: the next, else the previous. */
const neighbourId = (list: DocumentComment[], id: string): string | null => {
  const index = list.findIndex((comment) => comment.id === id);
  return (list[index + 1] ?? list[index - 1])?.id ?? null;
};

/**
 * @cc [owner:flvndvd,label:react] document-comments-panel
 * The panel MUST list unresolved threads in document order, then resolved threads in a
 * collapsed group. Reply and moderation controls MUST render only when canWrite, and replies
 * only on the active unresolved thread. Escape inside a reply field MUST clear it and return
 * focus to its thread, not close the panel. After resolving, reopening or deleting a thread,
 * focus MUST move to a neighbouring thread or to the panel heading. Opening or closing the
 * panel MUST NOT change the document.
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
  const order = new Map(
    Array.from(quotes.keys()).map((commentId, index) => [commentId, index])
  );
  const sorted = [...threads].sort(
    (a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
  const unresolved = sorted.filter((comment) => !comment.resolved);
  const resolved = sorted.filter((comment) => comment.resolved);

  useEffect(() => {
    if (!panelOpen || !focusRequest) {
      return;
    }
    const thread = focusRequest.threadId
      ? panelRef.current?.querySelector<HTMLElement>(
          `[data-thread-id="${focusRequest.threadId.replace(/["\\]/g, "\\$&")}"]`
        )
      : null;
    (thread ?? headingRef.current)?.focus();
  }, [panelOpen, focusRequest, panelRef]);

  const renderThread = (comment: DocumentComment) => {
    const siblings = comment.resolved ? resolved : unresolved;
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
