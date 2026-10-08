import {
  Button,
  Check,
  cn,
  Icon,
  MessageCircle01,
  PopoverAnchor,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Robot,
  TextArea,
  XClose,
} from "@dust-tt/sparkle";
import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useState,
  useRef,
} from "react";

import {
  Byline,
  CommentCard,
  Composer,
  Quote,
  ReplyBody,
} from "./CommentsPanel";
import {
  LightListRow,
  LightReplyInput,
  LightThread,
  quoted,
} from "./LightComments";
import type { DocComment, DocDraft } from "./docTypes";
import { useMentions } from "./MentionMenu";
import { SuggestionBlock, SuggestionComposer } from "./Suggestions";

// COMMENT, variant "floating" — no column: the thread opens in a card right
// under the highlighted text it's about, on top of the document. A new
// comment's draft opens the same way, under the selection.

const CARD_WIDTH = 340;

// One surface for the comments drop-down and the floating comment cards:
// same border, corners and shadow.
const DROPDOWN_SURFACE = "rounded-2xl border border-border shadow-xl";
const LIGHT_CARD_WIDTH = 300;
const EDGE = 16;

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

export function FloatingComments({
  containerRef,
  comments,
  draft,
  activeCommentId,
  agentName,
  isAgentBusy,
  layoutKey,
  onSaveDraft,
  onSaveSuggestion,
  onCancelDraft,
  onClose,
  onReply,
  onResolve,
  light = false,
}: {
  /** The positioned element the document is rendered in. */
  containerRef: RefObject<HTMLDivElement | null>;
  comments: DocComment[];
  draft: DocDraft | null;
  activeCommentId: string | null;
  agentName: string;
  isAgentBusy: boolean;
  /** Changes when the document's text does, to re-measure the anchor. */
  layoutKey: unknown;
  onSaveDraft: (body: string) => void;
  onSaveSuggestion: (text: string, note: string) => void;
  onCancelDraft: () => void;
  onClose: () => void;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  /** Comment style "light" (see LightComments). */
  light?: boolean;
}) {
  const anchorId = draft?.id ?? activeCommentId;
  const position = useAnchorPosition(containerRef, anchorId, layoutKey);
  const comment = draft
    ? null
    : comments.find((c) => c.id === activeCommentId && !c.resolved);

  if (!position || (!draft && !comment)) {
    return null;
  }

  if (light) {
    return (
      <div
        data-floating-comment
        className={cn("absolute z-20 bg-background p-3", DROPDOWN_SURFACE)}
        style={{
          top: position.top,
          left: position.left,
          width: LIGHT_CARD_WIDTH,
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            (draft ? onCancelDraft : onClose)();
          }
        }}
      >
        {/* Actions get their own row above the thread, never beside a name. */}
        <div className="-mr-1 -mt-1 mb-1 flex justify-end">
          {comment && !comment.suggestion && (
            <Button
              size="xs"
              variant="ghost"
              icon={Check}
              tooltip="Resolve"
              className="text-muted-foreground"
              onClick={() => onResolve(comment.id)}
            />
          )}
          <Button
            size="xs"
            variant="ghost"
            icon={XClose}
            aria-label="Close"
            className="text-muted-foreground"
            onClick={draft ? onCancelDraft : onClose}
          />
        </div>
        {draft?.suggest ? (
          <SuggestionComposer
            quote={draft.quote}
            onSubmit={onSaveSuggestion}
            onCancel={onCancelDraft}
          />
        ) : draft ? (
          <LightReplyInput
            autoFocus
            placeholder="Comment or @Dust"
            onSubmit={onSaveDraft}
            onCancel={onCancelDraft}
          />
        ) : (
          comment && (
            <LightThread
              comment={comment}
              agentName={agentName}
              isAgentBusy={isAgentBusy}
              onReply={(body) => onReply(comment.id, body)}
            />
          )
        )}
      </div>
    );
  }

  return (
    <div
      data-floating-comment
      className={cn(
        "absolute z-20 flex flex-col gap-2 bg-background p-3",
        DROPDOWN_SURFACE
      )}
      style={{ top: position.top, left: position.left, width: CARD_WIDTH }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          (draft ? onCancelDraft : onClose)();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 text-xs font-medium text-muted-foreground">
          {draft?.suggest
            ? "Suggest an edit"
            : draft
              ? "New comment"
              : comment?.suggestion
                ? "Suggestion"
                : "Comment"}
        </div>
        {comment && !comment.suggestion && (
          <Button
            size="xs"
            variant="ghost"
            icon={Check}
            tooltip="Resolve"
            onClick={() => onResolve(comment.id)}
          />
        )}
        <Button
          size="xs"
          variant="ghost"
          icon={XClose}
          aria-label="Close"
          onClick={draft ? onCancelDraft : onClose}
        />
      </div>
      {draft?.suggest ? (
        <SuggestionComposer
          showTitle={false}
          quote={draft.quote}
          onSubmit={onSaveSuggestion}
          onCancel={onCancelDraft}
        />
      ) : draft ? (
        <>
          <Composer
            autoFocus
            placeholder="Comment or @Dust"
            submitLabel="Comment"
            onSubmit={onSaveDraft}
            onCancel={onCancelDraft}
          />
        </>
      ) : (
        comment && (
          <CommentCard
            comment={comment}
            showQuote={false}
            showResolve={false}
            isActive
            agentName={agentName}
            onSelect={() => {}}
            onReply={(body) => onReply(comment.id, body)}
            onResolve={() => onResolve(comment.id)}
          />
        )
      )}
    </div>
  );
}

/**
 * The input at the bottom of a thread in the list: a reply, or — starting
 * with @agent — a request for the agent to edit the commented passage.
 */
function ThreadInput({
  agentName,
  disabled,
  onReply,
}: {
  agentName: string;
  disabled: boolean;
  onReply: (body: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentions = useMentions({ value, setValue, inputRef });
  const mention = `@${agentName}`;
  const isForAgent = value.toLowerCase().includes(mention.toLowerCase());
  const submit = () => {
    const text = value.trim();
    if (!text) {
      return;
    }
    // A reply mentioning an agent also calls it (see DocumentPanel.reply).
    onReply(text);
    setValue("");
  };
  return (
    <div className="flex flex-col gap-1">
      {mentions.menu}
      <TextArea
        ref={inputRef}
        value={value}
        minRows={1}
        resize="none"
        autoFocus
        disabled={disabled}
        placeholder={
          disabled ? `${mention} is editing…` : `Reply, or ${mention} to edit`
        }
        onChange={(e) => {
          setValue(e.target.value);
          mentions.onChange(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) {
            return;
          }
          if (mentions.onKeyDown(e)) {
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {isForAgent && (
        <div className="flex items-center gap-1 text-xs text-highlight-600">
          <Icon visual={Robot} size="xs" />
          Enter posts your reply and calls {mention}
        </div>
      )}
    </div>
  );
}

/**
 * The toolbar's comments button opens this list, floating over the document;
 * picking a comment jumps to its text and opens its thread.
 */
export function CommentsListPopover({
  comments,
  open,
  onOpenChange,
  onPick,
  onResolve,
  trigger,
  thread,
  light = false,
  anchorRef,
}: {
  comments: DocComment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (commentId: string) => void;
  onResolve: (commentId: string) => void;
  trigger: ReactNode;
  /**
   * Variant "list": the picked comment opens in place, inside the list, with
   * its thread and an input; the list stays open.
   */
  thread?: {
    activeCommentId: string | null;
    agentName: string;
    isAgentBusy: boolean;
    /** A reply mentioning an agent also calls it (DocumentPanel.reply). */
    onReply: (commentId: string, body: string) => void;
  };
  /** Comment style "light" (see LightComments). */
  light?: boolean;
  /**
   * Where the list opens instead of under the button: a fixed point (the top
   * right of the document area), so the list stays put over the text.
   */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const openComments = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  // Revealed when hovering a row (or focusing it with the keyboard).
  // Suggestions are settled by Accept / Reject instead.
  const resolveOnHover = (comment: DocComment) =>
    comment.suggestion ? null : (
      // Its own row at the top, above the name; the space stays reserved.
      <div className="-mb-1 -mr-1 flex justify-end opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        <Button
          size="xs"
          variant="ghost"
          icon={Check}
          tooltip="Resolve"
          onClick={(e) => {
            e.stopPropagation();
            onResolve(comment.id);
          }}
        />
      </div>
    );

  const expandedRow = (comment: DocComment, t: NonNullable<typeof thread>) => (
    <div
      key={comment.id}
      className="group/row relative flex flex-col gap-2 rounded-xl border border-highlight-300 bg-muted-background/60 px-3 py-2.5"
    >
      {resolveOnHover(comment)}
      {!comment.suggestion && (
        <div>
          <Quote text={comment.quote} />
        </div>
      )}
      <Byline author={comment.author} date={comment.createdAt} />
      <SuggestionBlock comment={comment} />
      {!comment.suggestion && (
        <div className="text-sm text-foreground">{comment.body}</div>
      )}
      {comment.replies.map((reply) => (
        <div key={reply.id} className="flex flex-col gap-1 pl-3">
          <Byline author={reply.author} date={reply.createdAt} />
          <ReplyBody reply={reply} />
        </div>
      ))}
      <ThreadInput
        agentName={t.agentName}
        disabled={t.isAgentBusy}
        onReply={(body) => t.onReply(comment.id, body)}
      />
    </div>
  );

  const lightRow = (comment: DocComment) =>
    thread && comment.id === thread.activeCommentId ? (
      <div
        key={comment.id}
        className="group/row relative flex flex-col gap-2 rounded-lg bg-muted-background/60 px-2.5 py-2"
      >
        {resolveOnHover(comment)}
        {!comment.suggestion && (
          <div className="truncate text-xs italic text-muted-foreground">
            {quoted(comment.quote)}
          </div>
        )}
        <LightThread
          comment={comment}
          agentName={thread.agentName}
          isAgentBusy={thread.isAgentBusy}
          autoFocus
          onReply={(body) => thread.onReply(comment.id, body)}
        />
      </div>
    ) : (
      <LightListRow
        key={comment.id}
        comment={comment}
        isActive={false}
        onPick={() => onPick(comment.id)}
        resolveButton={resolveOnHover(comment)}
      />
    );

  const row = (comment: DocComment) =>
    light ? (
      lightRow(comment)
    ) : thread && comment.id === thread.activeCommentId ? (
      expandedRow(comment, thread)
    ) : (
      <div
        key={comment.id}
        role="button"
        tabIndex={0}
        className="group/row relative flex w-full cursor-pointer flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted-background"
        onClick={() => onPick(comment.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick(comment.id);
          }
        }}
      >
        {resolveOnHover(comment)}
        <Byline author={comment.author} date={comment.createdAt} />
        {comment.suggestion ? (
          <SuggestionBlock comment={comment} />
        ) : (
          <Quote text={comment.quote} />
        )}
        {!comment.suggestion && (
          <div className="line-clamp-2 text-sm text-foreground">
            {comment.body}
          </div>
        )}
        {comment.replies.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {comment.replies.length}{" "}
            {comment.replies.length === 1 ? "reply" : "replies"}
          </div>
        )}
      </div>
    );

  return (
    <PopoverRoot open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {anchorRef && (
        <PopoverAnchor virtualRef={anchorRef as RefObject<HTMLElement>} />
      )}
      <PopoverContent
        // In the list variant, typing in a thread must not lose focus to the
        // document, and scrolling the document must not close the list.
        onOpenAutoFocus={(e) => e.preventDefault()}
        align="end"
        side="bottom"
        sideOffset={anchorRef ? 0 : 8}
        // Pinned: never flipped or shifted to fit.
        avoidCollisions={!anchorRef}
        fullWidth
        className={cn("w-[360px] overflow-hidden p-0", DROPDOWN_SURFACE)}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="heading-sm text-foreground">Comments</span>
          <Button
            size="xs"
            variant="ghost"
            icon={XClose}
            aria-label="Close comments"
            onClick={() => onOpenChange(false)}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {openComments.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
              <Icon
                visual={MessageCircle01}
                size="sm"
                className="text-muted-foreground"
              />
              <div className="text-sm font-medium text-foreground">
                No comments yet
              </div>
              <div className="text-sm text-muted-foreground">
                Select text to add a comment
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex flex-col",
                light ? "gap-0.5" : "divide-y divide-border"
              )}
            >
              {openComments.map(row)}
            </div>
          )}
          {resolved.length > 0 && (
            <div className="border-t border-border p-2">
              <Button
                size="xs"
                variant="ghost"
                label={`${showResolved ? "Hide" : "Show"} resolved (${resolved.length})`}
                onClick={() => setShowResolved((v) => !v)}
              />
              {showResolved && (
                <div className="flex flex-col opacity-70">
                  {resolved.map((comment) => (
                    <div key={comment.id} className="px-3 py-2">
                      <Byline
                        author={comment.author}
                        date={comment.createdAt}
                      />
                      <SuggestionBlock comment={comment} />
                      {!comment.suggestion && (
                        <div className="pt-1 text-sm text-foreground">
                          {comment.body}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

/**
 * A marker in the page's right margin, level with the first line of each
 * commented passage: a comment icon with a count. Clicking it
 * opens the thread. The count is the thread's messages: the comment and its
 * replies.
 */
export function CommentMarkers({
  containerRef,
  comments,
  activeCommentId,
  layoutKey,
  onOpen,
  light = false,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  comments: DocComment[];
  activeCommentId: string | null;
  /** Changes when the document's text does, to re-measure. */
  layoutKey: unknown;
  onOpen: (commentId: string) => void;
  /** Comment style "light": no border or shadow, just the icon and count. */
  light?: boolean;
}) {
  const [tops, setTops] = useState<Record<string, number>>({});
  const openComments = comments.filter((c) => !c.resolved);
  const ids = openComments.map((c) => c.id).join(",");

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

  // Comments starting on the same line share it: their markers sit side by
  // side, the first one closest to the page's edge.
  const placed: Array<{ comment: DocComment; top: number; slot: number }> = [];
  for (const comment of openComments) {
    const top = tops[comment.id];
    if (top === undefined) {
      continue;
    }
    const slot = placed.filter((p) => Math.abs(p.top - top) < 6).length;
    placed.push({ comment, top, slot });
  }

  return (
    <>
      {placed.map(({ comment, top, slot }) => (
        <button
          key={comment.id}
          type="button"
          data-floating-comment
          aria-label={`Open comment by ${comment.author.name}`}
          className={cn(
            "absolute z-10 flex h-6 -translate-y-1/2 items-center gap-1 rounded-full px-1.5 text-xs transition-colors",
            light
              ? comment.id === activeCommentId
                ? "bg-golden-100 text-foreground"
                : "text-muted-foreground/80 hover:bg-muted-background hover:text-foreground"
              : comment.id === activeCommentId
                ? "border border-golden-300 bg-golden-100 text-foreground shadow-sm"
                : "border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted-background hover:text-foreground"
          )}
          style={{ top, right: 12 + slot * 44 }}
          onClick={() => onOpen(comment.id)}
        >
          <Icon visual={MessageCircle01} size="xs" />
          {/* Messages in the thread: the comment plus its replies. */}
          <span>{comment.replies.length + 1}</span>
        </button>
      ))}
    </>
  );
}
