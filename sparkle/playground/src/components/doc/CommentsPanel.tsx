import { Avatar, Button, Check, cn, TextArea } from "@dust-tt/sparkle";
import { useRef, useState } from "react";

import type { DocAuthor, DocComment, DocDraft, DocReply } from "./docTypes";
import { useMentions } from "./MentionMenu";
import { SuggestionBlock, SuggestionComposer } from "./Suggestions";

// COMMENT, variant "margin" — a column next to the document. A comment is anchored to the
// text it quotes; it can get replies, be resolved, or be handed to the agent
// ("Ask @agent to address"), which turns it into an agent edit.

export function formatTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 24 * 60) {
    return `${Math.round(minutes / 60)} h ago`;
  }
  if (minutes < 48 * 60) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function Composer({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentions = useMentions({ value: body, setValue: setBody, inputRef });
  const submit = () => {
    if (body.trim()) {
      onSubmit(body.trim());
      setBody("");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {mentions.menu}
      <TextArea
        ref={inputRef}
        value={body}
        placeholder={placeholder}
        minRows={2}
        autoFocus={autoFocus}
        onChange={(e) => {
          setBody(e.target.value);
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
          if (e.key === "Escape") {
            onCancel?.();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button size="xs" variant="ghost" label="Cancel" onClick={onCancel} />
        )}
        <Button
          size="xs"
          variant="highlight"
          label={submitLabel}
          disabled={!body.trim()}
          onClick={submit}
        />
      </div>
    </div>
  );
}

/** A reply's text, or a "Thinking…" line while an agent writes it. */
export function ReplyBody({ reply }: { reply: DocReply }) {
  return reply.pending ? (
    <div className="animate-pulse text-sm italic text-muted-foreground">
      Thinking…
    </div>
  ) : (
    <div className="whitespace-pre-wrap text-sm text-foreground">
      {reply.body}
    </div>
  );
}

export function Byline({ author, date }: { author: DocAuthor; date: Date }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar
        size="xs"
        isRounded
        name={author.name}
        visual={author.pictureUrl}
      />
      <span className="text-sm font-medium text-foreground">{author.name}</span>
      <span className="text-xs text-muted-foreground">{formatTime(date)}</span>
    </div>
  );
}

export function Quote({ text }: { text: string }) {
  return (
    <div className="line-clamp-2 border-l-2 border-golden-300 pl-2 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function CommentCard({
  comment,
  isActive,
  agentName,
  onSelect,
  onReply,
  onResolve,
  showQuote = true,
  showResolve = true,
}: {
  comment: DocComment;
  /** False when the card sits right under its highlighted text. */
  showQuote?: boolean;
  /** False when the container shows its own resolve control. */
  showResolve?: boolean;
  isActive: boolean;
  agentName: string;
  onSelect: () => void;
  onReply: (body: string) => void;
  onResolve: () => void;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors",
        isActive
          ? "border-golden-300 bg-background shadow-sm"
          : "border-border bg-muted-background/40 hover:bg-muted-background"
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        // Only the card itself: keys typed in its reply field stay there.
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {showQuote && !comment.suggestion && <Quote text={comment.quote} />}
      <Byline author={comment.author} date={comment.createdAt} />
      <SuggestionBlock comment={comment} />
      {!comment.suggestion && (
        <div className="text-sm text-foreground">{comment.body}</div>
      )}
      {comment.replies.map((reply) => (
        <div
          key={reply.id}
          className="flex flex-col gap-1 border-t border-border pt-2"
        >
          <Byline author={reply.author} date={reply.createdAt} />
          <ReplyBody reply={reply} />
        </div>
      ))}
      {isActive && !comment.resolved && (
        <div
          className="flex flex-col gap-2 border-t border-border pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Composer
            placeholder={`Reply, or @${agentName}…`}
            submitLabel="Reply"
            onSubmit={onReply}
          />
          <div className="flex flex-wrap gap-2">
            {showResolve && !comment.suggestion && (
              <Button
                size="xs"
                variant="ghost"
                icon={Check}
                label="Resolve"
                onClick={onResolve}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({
  comments,
  draft,
  activeCommentId,
  agentName,
  onSaveDraft,
  onSaveSuggestion,
  onCancelDraft,
  onSelect,
  onReply,
  onResolve,
}: {
  comments: DocComment[];
  draft: DocDraft | null;
  activeCommentId: string | null;
  agentName: string;
  onSaveDraft: (body: string) => void;
  onSaveSuggestion: (text: string, note: string) => void;
  onCancelDraft: () => void;
  onSelect: (commentId: string) => void;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div className="flex flex-col gap-3">
      <div className="heading-sm text-foreground">
        Comments{open.length > 0 ? ` (${open.length})` : ""}
      </div>

      {draft && (
        <div className="flex flex-col gap-2 rounded-xl border border-golden-300 bg-background p-3 shadow-sm">
          {draft.suggest ? (
            <SuggestionComposer
              quote={draft.quote}
              onSubmit={onSaveSuggestion}
              onCancel={onCancelDraft}
            />
          ) : (
            <>
              <Quote text={draft.quote} />
              <Composer
                autoFocus
                placeholder="Comment or @Dust"
                submitLabel="Comment"
                onSubmit={onSaveDraft}
                onCancel={onCancelDraft}
              />
            </>
          )}
        </div>
      )}

      {open.length === 0 && !draft && (
        <div className="text-sm text-muted-foreground">
          Select text in the document to comment on it.
        </div>
      )}

      {open.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          isActive={comment.id === activeCommentId}
          agentName={agentName}
          onSelect={() => onSelect(comment.id)}
          onReply={(body) => onReply(comment.id, body)}
          onResolve={() => onResolve(comment.id)}
        />
      ))}

      {resolved.length > 0 && (
        <Button
          size="xs"
          variant="ghost"
          label={`${showResolved ? "Hide" : "Show"} resolved (${resolved.length})`}
          onClick={() => setShowResolved((v) => !v)}
        />
      )}
      {showResolved &&
        resolved.map((comment) => (
          <div
            key={comment.id}
            className="flex flex-col gap-1 rounded-xl border border-border p-3 opacity-70"
          >
            {!comment.suggestion && <Quote text={comment.quote} />}
            <SuggestionBlock comment={comment} />
            {!comment.suggestion && (
              <div className="text-sm text-foreground">{comment.body}</div>
            )}
          </div>
        ))}
    </div>
  );
}
