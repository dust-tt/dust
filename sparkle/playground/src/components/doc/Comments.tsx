import {
  ArrowUp,
  Avatar,
  Button,
  Check,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  Icon,
  Link01,
  MessageCircle01,
  MessageTextCircle01,
  Tooltip,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import {
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { YOU } from "./docSeeds";
import type { DocAuthor, DocComment, DocDraft, DocReply } from "./docTypes";
import { useMentions } from "./MentionMenu";
import { SuggestionBlock, SuggestionComposer } from "./Suggestions";

// Comments on the document, as designed in Figma (Co-edition, "Comments"):
// a thread card floating under the commented text, the list of every thread
// pinned at the top right, and the markers in the right margin (as in
// production's DocumentCommentMarkers).

const CARD_WIDTH = 300;
const EDGE = 16;
// A thread shows this many messages; the ones in between fold behind
// "View N comments" until the thread is closed.
const VISIBLE_MESSAGES = 3;

// The card and the list share one surface.
const SURFACE =
  "rounded-2xl border border-border bg-background shadow-md";

export function formatTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  const days = minutes / (24 * 60);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 120) {
    return "An hour ago";
  }
  if (minutes < 24 * 60) {
    return `${Math.round(minutes / 60)} hours ago`;
  }
  if (days < 2) {
    return "Yesterday";
  }
  if (days < 7) {
    return "A few days ago";
  }
  if (days < 14) {
    return "Last week";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── One message ──────────────────────────────────────────────────────────────

interface MessageActions {
  /** The thread's first message only. */
  onResolve?: () => void;
  onCopyLink?: () => void;
  /** Only on the viewer's own messages. */
  onDelete?: () => void;
}

/**
 * Revealed when hovering the message: resolve, then the other actions in a
 * "…" menu, or the single one as its own button.
 */
function Actions({ onResolve, onCopyLink, onDelete }: MessageActions) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const others = [
    onCopyLink && { label: "Copy link", icon: Link01, run: onCopyLink },
    onDelete && { label: "Delete", icon: Trash01, run: onDelete },
  ].filter((a) => !!a);
  return (
    <div
      className={cn(
        "-my-1 ml-auto flex items-center opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100",
        isMenuOpen && "opacity-100"
      )}
      // Acting on a message mustn't also pick its thread.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {onResolve && (
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={Check}
          tooltip="Resolve"
          onClick={onResolve}
        />
      )}
      {others.length === 1 && (
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={others[0].icon}
          tooltip={others[0].label}
          onClick={others[0].run}
        />
      )}
      {others.length > 1 && (
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="ghost-secondary"
              icon={DotsHorizontal}
              aria-label="More actions"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" mountPortal={false}>
            {onCopyLink && (
              <DropdownMenuItem
                icon={Link01}
                label="Copy link"
                onClick={onCopyLink}
              />
            )}
            {onDelete && (
              <DropdownMenuItem
                icon={Trash01}
                label="Delete"
                variant="warning"
                onClick={onDelete}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function Message({
  author,
  date,
  actions,
  children,
}: {
  author: DocAuthor;
  date: Date;
  actions: MessageActions;
  children: React.ReactNode;
}) {
  return (
    <div className="group/message flex gap-2">
      <Avatar
        size="xs"
        isRounded
        name={author.name}
        visual={author.pictureUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-6 items-center gap-[5px] text-xs">
          <span className="truncate font-semibold text-foreground">
            {author.name}
          </span>
          <span className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
          <span className="shrink-0 text-muted-foreground">
            {formatTime(date)}
          </span>
          <Actions {...actions} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Body({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
      {text}
    </div>
  );
}

/** A reply's text, or a "Thinking…" line while an agent writes it. */
function ReplyBody({ reply }: { reply: DocReply }) {
  return reply.pending ? (
    <div className="animate-pulse text-sm italic text-muted-foreground">
      Thinking…
    </div>
  ) : (
    <Body text={reply.body} />
  );
}

// ── The input ────────────────────────────────────────────────────────────────

/**
 * The composer-style field under a thread: "@" picks someone or an agent,
 * the pencil suggests an edit of the commented text, Enter sends.
 */
export function ThreadInput({
  placeholder = "Type or @...",
  disabled = false,
  autoFocus = false,
  onSubmit,
  onSuggest,
  onCancel,
}: {
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => void;
  onSuggest?: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentions = useMentions({ value, setValue, inputRef });
  const submit = () => {
    const text = value.trim();
    if (text) {
      onSubmit(text);
      setValue("");
    }
  };
  return (
    <div>
      {mentions.menu}
      <div
        className={cn(
          "flex items-end gap-1.5 rounded-xl border border-border-dark/60 bg-muted-background/40 py-2 pl-3 pr-2 transition-colors",
          // Focused: the composer's focused variant.
          "focus-within:border-highlight-300 focus-within:bg-background focus-within:ring-2 focus-within:ring-highlight-300/40",
          disabled && "opacity-60"
        )}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Comment"
          className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none border-0 bg-transparent p-0 py-0.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-0"
          onChange={(e) => {
            setValue(e.target.value);
            mentions.onChange(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || mentions.onKeyDown(e)) {
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              onCancel?.();
            }
          }}
        />
        {onSuggest && (
          <Button
            size="xs"
            variant="outline"
            isRounded
            icon={Edit04}
            tooltip="Suggest an edit"
            disabled={disabled}
            onClick={onSuggest}
          />
        )}
        <Button
          size="xs"
          variant="highlight"
          isRounded
          icon={ArrowUp}
          tooltip="Send"
          disabled={disabled || !value.trim()}
          onClick={submit}
        />
      </div>
    </div>
  );
}

// ── A thread ─────────────────────────────────────────────────────────────────

export interface ThreadHandlers {
  agentName: string;
  isAgentBusy: boolean;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  /** Deletes the whole thread. */
  onDelete: (commentId: string) => void;
  onDeleteReply: (commentId: string, replyId: string) => void;
  /** A suggested edit of the commented text, posted in the thread. */
  onSuggest: (commentId: string, text: string, note: string) => void;
}

function copyLink(commentId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("comment", commentId);
  void navigator.clipboard?.writeText(url.toString());
}

/**
 * The thread's messages; past three, the ones in the middle fold behind
 * "View N comments". Once unfolded, it stays so until the thread closes.
 */
function ThreadMessages({
  comment,
  handlers,
}: {
  comment: DocComment;
  handlers: ThreadHandlers;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const first = (
    <Message
      key={comment.id}
      author={comment.author}
      date={comment.createdAt}
      actions={{
        onResolve: comment.suggestion
          ? undefined
          : () => handlers.onResolve(comment.id),
        onCopyLink: () => copyLink(comment.id),
        onDelete:
          comment.author.name === YOU.name
            ? () => handlers.onDelete(comment.id)
            : undefined,
      }}
    >
      {comment.body && <Body text={comment.body} />}
      <SuggestionBlock comment={comment} showNote={false} />
    </Message>
  );
  const replies = comment.replies.map((reply) => (
    <Message
      key={reply.id}
      author={reply.author}
      date={reply.createdAt}
      actions={{
        onDelete:
          reply.author.name === YOU.name && !reply.pending
            ? () => handlers.onDeleteReply(comment.id, reply.id)
            : undefined,
      }}
    >
      <ReplyBody reply={reply} />
    </Message>
  ));
  const hidden = replies.length + 1 - VISIBLE_MESSAGES;
  if (isExpanded || hidden <= 0) {
    return (
      <>
        {first}
        {replies}
      </>
    );
  }
  return (
    <>
      {first}
      <button
        type="button"
        className="-my-1 self-start text-xs text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(true);
        }}
      >
        View {hidden} {hidden === 1 ? "comment" : "comments"}
      </button>
      {replies.slice(hidden)}
    </>
  );
}

/** The input under a thread, or the suggestion composer once asked for. */
function ThreadReply({
  comment,
  handlers,
  autoFocus,
}: {
  comment: DocComment;
  handlers: ThreadHandlers;
  autoFocus: boolean;
}) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const pendingSuggestion = comment.suggestion?.status === "pending";
  if (isSuggesting) {
    return (
      <SuggestionComposer
        quote={comment.quote}
        onSubmit={(text, note) => {
          handlers.onSuggest(comment.id, text, note);
          setIsSuggesting(false);
        }}
        onCancel={() => setIsSuggesting(false)}
      />
    );
  }
  return (
    <ThreadInput
      autoFocus={autoFocus}
      disabled={handlers.isAgentBusy}
      placeholder={
        handlers.isAgentBusy
          ? `@${handlers.agentName} is working…`
          : "Type or @..."
      }
      // One suggestion at a time per thread.
      onSuggest={pendingSuggestion ? undefined : () => setIsSuggesting(true)}
      onSubmit={(body) => handlers.onReply(comment.id, body)}
    />
  );
}

// ── The card under the text ──────────────────────────────────────────────────

/** Where the card goes: under the anchor's last line, inside the page. */
function useAnchorPosition(
  containerRef: RefObject<HTMLDivElement | null>,
  commentId: string | null,
  layoutKey: unknown
) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !commentId) {
      setPosition(null);
      return;
    }
    const measure = () => {
      const marks = container.querySelectorAll(
        `[data-comment-id="${CSS.escape(commentId)}"]`
      );
      if (marks.length === 0) {
        setPosition(null);
        return;
      }
      const box = container.getBoundingClientRect();
      const first = marks[0].getBoundingClientRect();
      const last = marks[marks.length - 1].getBoundingClientRect();
      const maxLeft = Math.max(EDGE, box.width - CARD_WIDTH - EDGE);
      setPosition({
        top: last.bottom - box.top + 8,
        left: Math.min(Math.max(first.left - box.left, EDGE), maxLeft),
      });
    };
    measure();
    // Typing reflows the text under the card; follow it.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, commentId, layoutKey]);

  return position;
}

/**
 * The thread of the picked comment, or a new comment's draft, in a card
 * floating under its text.
 */
export function ThreadCard({
  containerRef,
  comments,
  draft,
  activeCommentId,
  layoutKey,
  handlers,
  onSaveDraft,
  onSaveSuggestion,
  onSuggestDraft,
  onCancelDraft,
  onClose,
}: {
  /** The positioned element the document is rendered in. */
  containerRef: RefObject<HTMLDivElement | null>;
  comments: DocComment[];
  draft: DocDraft | null;
  activeCommentId: string | null;
  /** Changes when the document's text does, to re-measure the anchor. */
  layoutKey: unknown;
  handlers: ThreadHandlers;
  onSaveDraft: (body: string) => void;
  onSaveSuggestion: (text: string, note: string) => void;
  /** Turns the draft into a suggested edit. */
  onSuggestDraft: () => void;
  onCancelDraft: () => void;
  onClose: () => void;
}) {
  const anchorId = draft?.id ?? activeCommentId;
  const position = useAnchorPosition(containerRef, anchorId, layoutKey);
  const comment = draft
    ? null
    : comments.find((c) => c.id === activeCommentId && !c.resolved);

  if (!position || (!draft && !comment)) {
    return null;
  }

  return (
    <div
      data-floating-comment
      className={cn("absolute z-20 flex flex-col gap-4 p-4", SURFACE)}
      style={{ top: position.top, left: position.left, width: CARD_WIDTH }}
      role="dialog"
      aria-label={draft ? "New comment" : "Comment thread"}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          (draft ? onCancelDraft : onClose)();
        }
      }}
    >
      {draft?.suggest ? (
        <SuggestionComposer
          quote={draft.quote}
          onSubmit={onSaveSuggestion}
          onCancel={onCancelDraft}
        />
      ) : draft ? (
        <ThreadInput
          autoFocus
          onSubmit={onSaveDraft}
          onSuggest={onSuggestDraft}
          onCancel={onCancelDraft}
        />
      ) : (
        comment && (
          // Keyed: another thread starts folded again.
          <ThreadBody key={comment.id} comment={comment} handlers={handlers} />
        )
      )}
    </div>
  );
}

function ThreadBody({
  comment,
  handlers,
  autoFocus = false,
}: {
  comment: DocComment;
  handlers: ThreadHandlers;
  autoFocus?: boolean;
}) {
  return (
    <>
      <ThreadMessages comment={comment} handlers={handlers} />
      <ThreadReply
        comment={comment}
        handlers={handlers}
        autoFocus={autoFocus}
      />
    </>
  );
}

// ── The list of every thread ─────────────────────────────────────────────────

/**
 * Every thread, pinned at the top right of the document. Picking one
 * scrolls to its text and unfolds it in place, on a muted background, with
 * its input focused; the list stays open.
 */
export function CommentsList({
  comments,
  activeCommentId,
  handlers,
  onPick,
  onClose,
}: {
  comments: DocComment[];
  activeCommentId: string | null;
  handlers: ThreadHandlers;
  onPick: (commentId: string) => void;
  onClose: () => void;
}) {
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div
      data-floating-comment
      role="region"
      aria-label="Comments"
      className={cn(
        "flex max-h-full w-[300px] flex-col overflow-hidden py-4",
        SURFACE
      )}
    >
      <div className="flex shrink-0 items-center justify-between px-4 pb-2">
        <span className="text-xs font-semibold text-foreground">
          Comments ({open.length})
        </span>
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={XClose}
          aria-label="Close comments"
          onClick={onClose}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <Icon
              visual={MessageCircle01}
              size="sm"
              className="text-muted-foreground"
            />
            <p className="text-sm font-medium text-foreground">
              No comments yet
            </p>
            <p className="text-sm text-muted-foreground">
              Select text to add a comment.
            </p>
          </div>
        ) : (
          open.map((comment, index) => {
            const isActive = comment.id === activeCommentId;
            const previousActive = open[index - 1]?.id === activeCommentId;
            return (
              <div key={comment.id}>
                {/* Rule between threads, except around the picked one. */}
                {index > 0 && !isActive && !previousActive && (
                  <div className="mx-4 my-2 h-px bg-border" />
                )}
                {isActive ? (
                  <div className="my-2 flex flex-col gap-4 bg-muted-background px-4 py-4">
                    <ThreadBody comment={comment} handlers={handlers} autoFocus />
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer flex-col gap-4 px-4 py-2 transition-colors hover:bg-muted-background/60"
                    onClick={() => onPick(comment.id)}
                    onKeyDown={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        onPick(comment.id);
                      }
                    }}
                  >
                    <ThreadMessages comment={comment} handlers={handlers} />
                  </div>
                )}
              </div>
            );
          })
        )}
        {resolved.length > 0 && (
          <Collapsible className="mx-4 mt-2 border-t border-border pt-2">
            <CollapsibleTrigger
              variant="secondary"
              label={`Resolved (${resolved.length})`}
            />
            <CollapsibleContent className="flex flex-col gap-4 pt-2 opacity-70">
              {resolved.map((comment) => (
                <div key={comment.id} className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">
                    {comment.author.name} · {formatTime(comment.createdAt)}
                  </div>
                  <Body text={comment.body} />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

/** The top bar button that opens the list, with the open count. */
export function CommentsToggle({
  comments,
  isOpen,
  onToggle,
}: {
  comments: DocComment[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const count = comments.filter((c) => !c.resolved).length;
  return (
    <Button
      size="sm"
      variant={isOpen ? "primary" : "ghost"}
      icon={MessageCircle01}
      label={count > 0 ? String(count) : undefined}
      tooltip="All comments"
      aria-label="All comments"
      aria-expanded={isOpen}
      onClick={onToggle}
    />
  );
}

// ── Markers in the margin ────────────────────────────────────────────────────

/**
 * A marker in the right margin, level with each commented passage, as in
 * production: comments starting on the same line share one marker, which
 * shows their count and opens them in turn.
 */
export function CommentMarkers({
  containerRef,
  comments,
  activeCommentId,
  layoutKey,
  onOpen,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  comments: DocComment[];
  activeCommentId: string | null;
  /** Changes when the document's text does, to re-measure. */
  layoutKey: unknown;
  onOpen: (commentId: string) => void;
}) {
  const [tops, setTops] = useState<Record<string, number>>({});
  const open = comments.filter((c) => !c.resolved);
  const ids = open.map((c) => c.id).join(",");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const measure = () => {
      const box = container.getBoundingClientRect();
      const next: Record<string, number> = {};
      for (const id of ids.split(",").filter(Boolean)) {
        const mark = container.querySelector(
          `[data-comment-id="${CSS.escape(id)}"]`
        );
        if (mark) {
          const rect = mark.getBoundingClientRect();
          // Centered on the passage's first line.
          next[id] = rect.top - box.top + rect.height / 2;
        }
      }
      setTops(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, ids, layoutKey]);

  const clusters: Array<{ top: number; comments: DocComment[] }> = [];
  for (const comment of open) {
    const top = tops[comment.id];
    if (top === undefined) {
      continue;
    }
    const cluster = clusters.find((c) => Math.abs(c.top - top) < 6);
    if (cluster) {
      cluster.comments.push(comment);
    } else {
      clusters.push({ top, comments: [comment] });
    }
  }

  return (
    <>
      {clusters.map(({ top, comments: cluster }) => {
        const active = cluster.findIndex((c) => c.id === activeCommentId);
        const next = cluster[(active + 1) % cluster.length];
        const count = cluster.length;
        const label =
          count > 1 ? `${count} comments` : `Comment by ${cluster[0].author.name}`;
        return (
          <Tooltip
            key={cluster.map((c) => c.id).join(",")}
            label={label}
            tooltipTriggerAsChild
            trigger={
              <button
                type="button"
                data-floating-comment
                aria-label={`Show ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
                aria-current={active >= 0 ? "true" : undefined}
                style={{ top }}
                className={cn(
                  "absolute right-3 z-10 flex h-7 min-w-7 -translate-y-1/2 items-center justify-center gap-1 rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted-background hover:text-foreground",
                  "aria-[current=true]:border-golden-500/60 aria-[current=true]:bg-golden-300/40 aria-[current=true]:text-foreground",
                  count > 1 && "px-2"
                )}
                onClick={() => onOpen(next.id)}
              >
                <Icon visual={MessageTextCircle01} size="xs" />
                {count > 1 && (
                  <span className="text-xs font-medium tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            }
          />
        );
      })}
    </>
  );
}
