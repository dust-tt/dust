import { parseInlineMarkdown } from "@app/components/editor/document/content";
import { DocumentCommentInput } from "@app/components/editor/document/DocumentCommentInput";
import type { DocumentProps } from "@app/components/editor/document/types";
import { formatRelativeTime } from "@app/lib/client/relative_time";
import { formatDateTime } from "@app/lib/i18n/format";
import type { DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { readMessageSuggestions } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import {
  AlertCircle,
  Button,
  Check,
  cn,
  Icon,
  ReverseLeft,
  Tooltip,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Extensions } from "@tiptap/core";
import type { ComponentType, ReactNode } from "react";
import { Fragment, useMemo, useRef, useState } from "react";

interface ThreadIconButtonProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  busy?: boolean;
  mountPortalContainer?: HTMLElement;
}

const ThreadIconButton = ({
  label,
  icon,
  onClick,
  busy = false,
  mountPortalContainer,
}: ThreadIconButtonProps) => (
  <Tooltip
    label={label}
    tooltipTriggerAsChild
    mountPortalContainer={mountPortalContainer}
    trigger={
      <button
        type="button"
        aria-label={label}
        aria-disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          if (!busy) {
            onClick();
          }
        }}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        )}
      >
        <Icon visual={icon} size="xs" />
      </button>
    }
  />
);

export type RenderAuthorAvatar = DocumentProps["renderCommentAuthorAvatar"];

/** The pill the comment and reply fields sit in. */
export const COMMENT_FIELD_CLASS =
  "rounded-xl bg-muted-background py-0.5 pl-3 pr-1 ring-highlight-300 focus-within:ring-1";

/** The commented text, in quotation marks unless it already opens with one. */
export const quoted = (text: string) =>
  /^[“"«‘']/.test(text) ? text : `“${text}”`;

interface MessageBylineProps {
  message: DfmMessage;
  /** False marks the message as unverified; null shows no mark. */
  verified: boolean | null;
  mountPortalContainer?: HTMLElement;
}

/**
 * @cc [owner:tdraier,label:security] document-unverified-mark
 * A message whose signature did not verify MUST show an Unverified mark next to its author,
 * since its author and text may not be what they claim. A verified message, or one whose check
 * is unknown, MUST NOT show it.
 */
const MessageByline = ({
  message,
  verified,
  mountPortalContainer,
}: MessageBylineProps) => {
  const { t } = useLingui();
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="min-w-0 truncate text-xs font-medium text-foreground">
        {message.author.name}
      </span>
      {verified === false && (
        <Tooltip
          label={t`Dust cannot confirm who wrote this message. It may come from an agent or an edit made outside the editor.`}
          tooltipTriggerAsChild
          mountPortalContainer={mountPortalContainer}
          trigger={
            <span className="inline-flex shrink-0 items-center gap-1 self-center text-xs text-warning-500">
              <Icon visual={AlertCircle} size="xs" />
              <Trans>Unverified</Trans>
            </span>
          }
        />
      )}
      <time
        dateTime={message.createdAt}
        title={formatDateTime(new Date(message.createdAt))}
        className="shrink-0 text-xs text-muted-foreground"
      >
        {formatRelativeTime(new Date(message.createdAt))}
      </time>
    </div>
  );
};

interface ThreadMessageProps extends MessageBylineProps {
  renderAuthorAvatar: RenderAuthorAvatar;
  /** Clamps the text, for a thread folded in the list. */
  clamped?: boolean;
  children: ReactNode;
}

const ThreadMessage = ({
  message,
  verified,
  renderAuthorAvatar,
  clamped = false,
  mountPortalContainer,
  children,
}: ThreadMessageProps) => (
  <div className="flex gap-2">
    <span aria-hidden="true" className="mt-0.5 shrink-0">
      {renderAuthorAvatar(message.author, "xxs")}
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <MessageByline
        message={message}
        verified={verified}
        mountPortalContainer={mountPortalContainer}
      />
      <div
        className={cn(
          "flex flex-col gap-1.5 text-sm leading-snug text-foreground wrap-anywhere",
          clamped && "line-clamp-3"
        )}
      >
        {children}
      </div>
    </div>
  </div>
);

interface SuggestionCardProps {
  quote: string | undefined;
  suggestion: string;
  renderBody: (body: string) => ReactNode;
  onApply?: () => Promise<unknown>;
  busy: boolean;
}

/**
 * @cc [owner:tdraier,label:react] document-comment-suggestion-card
 * A message with a suggestion MUST show the current commented text it would replace and the
 * suggested text, or that it deletes the text when the suggestion is blank. Apply MUST render
 * only when the user can write, the thread is open, its commented text lies in one textblock and
 * the suggestion reads as one paragraph of inline Markdown. A refused Apply, such as one another
 * comment blocks, MUST show the reason on its thread.
 */
const SuggestionCard = ({
  quote,
  suggestion,
  renderBody,
  onApply,
  busy,
}: SuggestionCardProps) => {
  const { t } = useLingui();
  const [applying, setApplying] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted-background py-1 pl-2 pr-1">
        <span className="text-xs font-medium text-muted-foreground">
          <Trans>Suggested change</Trans>
        </span>
        {onApply && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            label={t`Apply`}
            isLoading={applying}
            disabled={busy && !applying}
            onClick={(event) => {
              event.stopPropagation();
              setApplying(true);
              void onApply().finally(() => setApplying(false));
            }}
          />
        )}
      </div>
      <div className="bg-warning-100/60 px-2 py-1 line-through decoration-foreground/40 wrap-anywhere dark:bg-warning-500/20">
        <span className="sr-only">{t`Replaces:`} </span>
        {quote || t`The commented text was removed.`}
      </div>
      <div className="bg-success-100/60 px-2 py-1 dark:bg-success-500/20">
        <span className="sr-only">{t`With:`} </span>
        {suggestion.trim() ? (
          renderBody(suggestion)
        ) : (
          <span className="text-xs text-muted-foreground">
            <Trans>Deletes the text.</Trans>
          </span>
        )}
      </div>
    </div>
  );
};

interface MessageBodyProps {
  body: string;
  quote: string | undefined;
  renderBody: (body: string) => ReactNode;
  onApplySuggestion?: (suggestion: string) => Promise<unknown>;
  busy: boolean;
}

/**
 * @cc [owner:tdraier,label:react] document-comment-message-body
 * A message MUST render its text and each of its suggestions where they stand in the body, each
 * suggestion as its own card, applying its own text. The text between suggestions renders as
 * separate Markdown bodies, so a reference definition applies only within its own part.
 */
const MessageBody = ({
  body,
  quote,
  renderBody,
  onApplySuggestion,
  busy,
}: MessageBodyProps) => {
  const parts = useMemo(() => {
    const read = readMessageSuggestions(body);
    if (read.isErr() || !read.value) {
      return null;
    }
    // Keyed by where each part starts; the +1 keeps consecutive empty suggestions apart.
    let position = 0;
    return read.value.map((part) => {
      const key = `${part.kind}-${position}`;
      position +=
        (part.kind === "text" ? part.text : part.suggestion).length + 1;
      return {
        ...part,
        key,
        applicable:
          part.kind === "suggestion" &&
          parseInlineMarkdown(part.suggestion).isOk(),
      };
    });
  }, [body]);
  if (!parts) {
    return renderBody(body);
  }
  return (
    <>
      {parts.map((part) =>
        part.kind === "text" ? (
          <Fragment key={part.key}>{renderBody(part.text)}</Fragment>
        ) : (
          <SuggestionCard
            key={part.key}
            quote={quote}
            suggestion={part.suggestion}
            renderBody={renderBody}
            onApply={
              onApplySuggestion && part.applicable
                ? () => onApplySuggestion(part.suggestion)
                : undefined
            }
            busy={busy}
          />
        )
      )}
    </>
  );
};

interface DocumentCommentDraftCardProps {
  onSubmit: (body: string) => Promise<Result<void, string>>;
  onCancel: () => void;
  onFilledChange: (filled: boolean) => void;
  onSuggest?: () => Result<string, string>;
  inputExtensions?: Extensions;
  mountPortalContainer?: HTMLElement;
}

export const DocumentCommentDraftCard = ({
  onSubmit,
  onCancel,
  onFilledChange,
  onSuggest,
  inputExtensions,
  mountPortalContainer,
}: DocumentCommentDraftCardProps) => {
  const { t } = useLingui();
  return (
    <article aria-label={t`New comment`}>
      <DocumentCommentInput
        label={t`Comment`}
        placeholder={t`Comment or @mention…`}
        renderAuthorAvatar={() => null}
        onSubmit={onSubmit}
        onCancel={onCancel}
        onFilledChange={onFilledChange}
        autoFocus
        onSuggest={onSuggest}
        extensions={inputExtensions}
        mountPortalContainer={mountPortalContainer}
        className={COMMENT_FIELD_CLASS}
      />
    </article>
  );
};

interface ThreadActionsProps {
  resolved: boolean;
  canWrite: boolean;
  /** Folded in the list, the actions show on hover; the space stays reserved. */
  folded: boolean;
  busy: boolean;
  onSetResolved: (resolved: boolean) => void;
  onDelete: () => void;
  onClose?: () => void;
  mountPortalContainer?: HTMLElement;
}

const ThreadActions = ({
  resolved,
  canWrite,
  folded,
  busy,
  onSetResolved,
  onDelete,
  onClose,
  mountPortalContainer,
}: ThreadActionsProps) => {
  const { t } = useLingui();
  return (
    <div
      className={cn(
        "-mr-1 -mt-1 -mb-2 flex justify-end",
        folded &&
          "opacity-0 transition-opacity group-focus-within/thread:opacity-100 group-hover/thread:opacity-100"
      )}
    >
      {canWrite && (
        <>
          <ThreadIconButton
            label={resolved ? t`Reopen` : t`Resolve`}
            icon={resolved ? ReverseLeft : Check}
            onClick={() => onSetResolved(!resolved)}
            busy={busy}
            mountPortalContainer={mountPortalContainer}
          />
          <ThreadIconButton
            label={t`Delete comment`}
            icon={Trash01}
            onClick={onDelete}
            busy={busy}
            mountPortalContainer={mountPortalContainer}
          />
        </>
      )}
      {onClose && (
        <ThreadIconButton
          label={t`Close`}
          icon={XClose}
          onClick={onClose}
          mountPortalContainer={mountPortalContainer}
        />
      )}
    </div>
  );
};

interface ThreadRepliesProps {
  replies: DfmMessage[];
  folded: boolean;
  isVerified: (index: number) => boolean | null;
  renderAuthorAvatar: RenderAuthorAvatar;
  renderMessageBody: (body: string) => ReactNode;
  mountPortalContainer?: HTMLElement;
}

/** Every reply, or only how many there are while the thread is folded. */
const ThreadReplies = ({
  replies,
  folded,
  isVerified,
  renderAuthorAvatar,
  renderMessageBody,
  mountPortalContainer,
}: ThreadRepliesProps) => {
  const { t } = useLingui();
  if (folded) {
    return replies.length > 0 ? (
      <p className="pl-7 text-xs text-muted-foreground">
        {t`${plural(replies.length, { one: "# reply", other: "# replies" })}`}
      </p>
    ) : null;
  }
  return replies.map((reply, index) => (
    <ThreadMessage
      key={`${reply.createdAt}:${index}`}
      message={reply}
      verified={isVerified(index + 1)}
      renderAuthorAvatar={renderAuthorAvatar}
      mountPortalContainer={mountPortalContainer}
    >
      {renderMessageBody(reply.body)}
    </ThreadMessage>
  ));
};

interface DocumentCommentThreadProps {
  comment: DfmComment;
  quote: string | undefined;
  /**
   * `card` floats over the text it comments, showing the whole thread. `list` sits in the
   * comments list under its commented text, folded to its first message until active.
   */
  variant: "card" | "list";
  active: boolean;
  canWrite: boolean;
  /** Whether a resolve, reopen, delete or suggestion is pending on the thread. */
  busy: boolean;
  /** The reason the thread's last action was refused. */
  error: string | null;
  isVerified: (index: number) => boolean | null;
  onSelect?: () => void;
  onReply: (body: string) => Promise<Result<void, string>>;
  onSetResolved: (resolved: boolean) => void;
  onDelete: () => void;
  /** Shows a Close action, for the floating card. */
  onClose?: () => void;
  onElement: (element: HTMLElement | null) => void;
  renderBody: (body: string) => ReactNode;
  onSuggest?: () => Result<string, string>;
  onApplySuggestion?: (suggestion: string) => Promise<unknown>;
  inputExtensions?: Extensions;
  mountPortalContainer?: HTMLElement;
  renderAuthorAvatar: RenderAuthorAvatar;
}

export const DocumentCommentThread = ({
  comment,
  quote,
  variant,
  active,
  canWrite,
  busy,
  error,
  isVerified,
  onSelect,
  onReply,
  onSetResolved,
  onDelete,
  onClose,
  onElement,
  renderBody,
  onSuggest,
  onApplySuggestion,
  inputExtensions,
  mountPortalContainer,
  renderAuthorAvatar,
}: DocumentCommentThreadProps) => {
  const { t } = useLingui();
  const ref = useRef<HTMLElement | null>(null);
  const [first, ...replies] = comment.messages;
  const resolved = comment.status === "resolved";
  const authorName = first.author.name;
  const folded = variant === "list" && !active;
  const renderMessageBody = (body: string) => (
    <MessageBody
      body={body}
      quote={quote}
      renderBody={renderBody}
      onApplySuggestion={onApplySuggestion}
      busy={busy}
    />
  );

  return (
    <article
      ref={(element) => {
        ref.current = element;
        onElement(element);
      }}
      tabIndex={-1}
      aria-label={t`Comment by ${authorName}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group/thread rounded-lg transition-colors motion-reduce:transition-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        variant === "list" &&
          (active ? "bg-muted-background/60" : "hover:bg-muted-background/60")
      )}
    >
      {/* Only catches clicks bubbling from the thread; the quoted text is its keyboard control. */}
      <div
        role="presentation"
        onClick={onSelect}
        className={cn(
          "flex flex-col gap-3",
          variant === "list" && "cursor-pointer px-2.5 py-2"
        )}
      >
        {(canWrite || onClose) && (
          <ThreadActions
            resolved={resolved}
            canWrite={canWrite}
            folded={folded}
            busy={busy}
            onSetResolved={onSetResolved}
            onDelete={onDelete}
            onClose={onClose}
            mountPortalContainer={mountPortalContainer}
          />
        )}
        {error && (
          <p role="alert" className="text-xs text-warning-500">
            {error}
          </p>
        )}
        {variant === "list" && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.();
            }}
            className={cn(
              "truncate rounded-md text-left text-xs italic text-muted-foreground",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              resolved && "line-through decoration-muted-foreground/60"
            )}
          >
            <span className="sr-only">{t`Commented text:`} </span>
            {quote ? quoted(quote) : t`The commented text was removed.`}
          </button>
        )}
        <ThreadMessage
          message={first}
          verified={isVerified(0)}
          renderAuthorAvatar={renderAuthorAvatar}
          clamped={folded}
          mountPortalContainer={mountPortalContainer}
        >
          {renderMessageBody(first.body)}
        </ThreadMessage>
        <ThreadReplies
          replies={replies}
          folded={folded}
          isVerified={isVerified}
          renderAuthorAvatar={renderAuthorAvatar}
          renderMessageBody={renderMessageBody}
          mountPortalContainer={mountPortalContainer}
        />
        {canWrite && !folded && !resolved && (
          <DocumentCommentInput
            label={t`Reply`}
            placeholder={t`Reply or @mention…`}
            renderAuthorAvatar={renderAuthorAvatar}
            onSubmit={onReply}
            // Escape clears the field and hands focus back to the thread.
            onCancel={() => ref.current?.focus()}
            onSuggest={onSuggest}
            extensions={inputExtensions}
            mountPortalContainer={mountPortalContainer}
            className={COMMENT_FIELD_CLASS}
          />
        )}
      </div>
    </article>
  );
};
