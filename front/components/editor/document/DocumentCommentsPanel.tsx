import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { formatRelativeTime } from "@app/lib/client/relative_time";
import { formatDateTime } from "@app/lib/i18n/format";
import type { DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import {
  Avatar,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Icon,
  Tooltip,
  XClose,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useEffect, useRef } from "react";

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

interface CommentThreadProps {
  comment: DfmComment;
  quote: string | undefined;
  active: boolean;
  onSelect: () => void;
}

const CommentThread = ({
  comment,
  quote,
  active,
  onSelect,
}: CommentThreadProps) => {
  const ref = useRef<HTMLElement>(null);
  const [first, ...replies] = comment.messages;
  const resolved = comment.status === "resolved";

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
      aria-label={`Comment by ${first.author.name}`}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-background p-3 transition-colors motion-reduce:transition-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-golden-500/60 ring-1 ring-golden-500/40"
          : "hover:border-border-dark",
        resolved && "bg-muted-background"
      )}
    >
      <header className="flex items-center gap-1">
        <MessageByline message={first} size="xxs" />
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
      <p className="text-sm whitespace-pre-wrap wrap-anywhere">{first.body}</p>
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
    </article>
  );
};

interface DocumentCommentsPanelProps {
  id: string;
  comments: DocumentCommentsController;
  mountPortalContainer?: HTMLElement;
}

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comments-panel
 * The panel MUST list open threads in document order, then resolved threads in a collapsed
 * group. Opening or closing the panel MUST NOT change the document.
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
    panelOpen,
    focusRequest,
    panelRef,
    closePanel,
    jumpTo,
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
  const unresolved = sorted.filter((comment) => comment.status === "open");
  const resolved = sorted.filter((comment) => comment.status === "resolved");

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

  const renderThread = (comment: DfmComment) => (
    <CommentThread
      key={comment.id}
      comment={comment}
      quote={quotes.get(comment.id)}
      active={comment.id === activeId}
      onSelect={() => jumpTo(comment.id)}
    />
  );

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
