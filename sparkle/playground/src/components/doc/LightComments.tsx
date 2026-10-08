import { Avatar, cn } from "@dust-tt/sparkle";
import { useRef, useState } from "react";

import { formatTime } from "./CommentsPanel";
import type { DocAuthor, DocComment } from "./docTypes";
import { useMentions } from "./MentionMenu";
import { SuggestionBlock } from "./Suggestions";

// COMMENT STYLE "light" — the same threads as the default style, with less
// chrome: no nested cards or rules, a one-line author header, and a
// single-line reply field (Enter sends, the sparkle asks the agent).

function Message({
  author,
  date,
  body,
  pending = false,
}: {
  author: DocAuthor;
  date: Date;
  body: string;
  /** An agent still writing its reply. */
  pending?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Avatar
        size="xxs"
        isRounded
        name={author.name}
        visual={author.pictureUrl}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">
            {author.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTime(date)}
          </span>
        </div>
        {pending ? (
          <div className="animate-pulse text-sm italic text-muted-foreground">
            Thinking…
          </div>
        ) : (
          body && (
            <div className="whitespace-pre-wrap text-sm leading-snug text-foreground">
              {body}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** One line: Enter sends (an @agent mention in it also calls that agent). */
export function LightReplyInput({
  placeholder,
  agentName,
  disabled,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  agentName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mentions = useMentions({ value, setValue, inputRef });
  return (
    <div className="flex items-center gap-1 rounded-full bg-muted-background py-0.5 pl-3 pr-0.5 ring-highlight-300 focus-within:ring-1">
      {mentions.menu}
      <input
        ref={inputRef}
        // Reset the forms plugin's input box: the pill is the field.
        className="min-w-0 flex-1 border-0 bg-transparent p-0 py-1 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:ring-0"
        value={value}
        placeholder={
          disabled && agentName ? `@${agentName} is editing…` : placeholder
        }
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          setValue(e.target.value);
          mentions.onChange(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (mentions.onKeyDown(e)) return;
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            onSubmit(value.trim());
            setValue("");
          }
          if (e.key === "Escape") onCancel?.();
        }}
      />
    </div>
  );
}

export function LightThread({
  comment,
  agentName,
  isAgentBusy,
  autoFocus,
  onReply,
}: {
  comment: DocComment;
  agentName: string;
  isAgentBusy: boolean;
  autoFocus?: boolean;
  onReply: (body: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Message
        author={comment.author}
        date={comment.createdAt}
        body={comment.body}
      />
      <SuggestionBlock comment={comment} showNote={false} />
      {comment.replies.map((reply) => (
        <Message
          key={reply.id}
          author={reply.author}
          date={reply.createdAt}
          body={reply.body}
          pending={reply.pending}
        />
      ))}
      <LightReplyInput
        placeholder={`Reply, or @${agentName}…`}
        agentName={agentName}
        disabled={isAgentBusy}
        autoFocus={autoFocus}
        onSubmit={onReply}
      />
    </div>
  );
}

/** The quote, in quotation marks unless it already starts with one. */
export function quoted(text: string): string {
  return /^[“"«‘']/.test(text) ? text : `“${text}”`;
}

/** A collapsed row in the comments list. */
export function LightListRow({
  comment,
  isActive,
  onPick,
  resolveButton,
}: {
  comment: DocComment;
  isActive: boolean;
  onPick: () => void;
  resolveButton: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group/row relative flex cursor-pointer flex-col gap-1 rounded-lg px-2.5 py-2 transition-colors",
        isActive ? "bg-muted-background" : "hover:bg-muted-background/60"
      )}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      {resolveButton}
      {!comment.suggestion && (
        <div className="truncate text-xs italic text-muted-foreground">
          {quoted(comment.quote)}
        </div>
      )}
      <Message
        author={comment.author}
        date={comment.createdAt}
        body={comment.body}
      />
      <SuggestionBlock comment={comment} showNote={false} />
      {comment.replies.length > 0 && (
        <div className="pl-7 text-xs text-muted-foreground">
          {comment.replies.length}{" "}
          {comment.replies.length === 1 ? "reply" : "replies"}
        </div>
      )}
    </div>
  );
}
