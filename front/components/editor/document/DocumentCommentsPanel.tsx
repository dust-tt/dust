import { parseInlineMarkdown } from "@app/components/editor/document/content";
import { DocumentCommentInput } from "@app/components/editor/document/DocumentCommentInput";
import type {
  DocumentCommentAvatarSize,
  DocumentProps,
} from "@app/components/editor/document/types";
import type { DocumentCommentsController } from "@app/components/editor/document/useDocumentComments";
import { formatRelativeTime } from "@app/lib/client/relative_time";
import { formatDateTime } from "@app/lib/i18n/format";
import type { DfmAuthor, DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { readMessageSuggestions } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import {
  AlertCircle,
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
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ComponentType, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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

type RenderAuthorAvatar = DocumentProps["renderCommentAuthorAvatar"];

const renderNoAvatar: RenderAuthorAvatar = () => null;

interface MessageBylineProps {
  message: DfmMessage;
  size: DocumentCommentAvatarSize;
  renderAuthorAvatar: RenderAuthorAvatar;
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
  size,
  renderAuthorAvatar,
  verified,
  mountPortalContainer,
}: MessageBylineProps) => {
  const { t } = useLingui();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span aria-hidden="true">{renderAuthorAvatar(message.author, size)}</span>
      <span className="min-w-0 truncate text-sm font-medium">
        {message.author.name}
      </span>
      {verified === false && (
        <Tooltip
          label={t`Dust cannot confirm who wrote this message. It may come from an agent or an edit made outside the editor.`}
          tooltipTriggerAsChild
          mountPortalContainer={mountPortalContainer}
          trigger={
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-warning-500">
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

interface SuggestionCardProps {
  quote: string | undefined;
  suggestion: string;
  renderBody: (body: string) => ReactNode;
  onApply?: () => Result<void, string>;
}

/**
 * @cc [owner:tdraier,label:react] document-comment-suggestion-card
 * A message with a suggestion MUST show the current commented text it would replace and the
 * suggested text, or that it deletes the text. Apply MUST render only when the thread can take
 * a suggestion and the suggestion reads as one paragraph of inline Markdown, and a refused Apply
 * MUST show the reason.
 */
const SuggestionCard = ({
  quote,
  suggestion,
  renderBody,
  onApply,
}: SuggestionCardProps) => {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted-background py-1 pl-2 pr-1">
        <span className="text-xs font-medium text-muted-foreground">
          Suggested change
        </span>
        {onApply && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            label="Apply"
            onClick={(event) => {
              event.stopPropagation();
              const applied = onApply();
              setError(applied.isErr() ? applied.error : null);
            }}
          />
        )}
      </div>
      <div className="bg-warning-100/60 px-2 py-1 line-through decoration-foreground/40 wrap-anywhere dark:bg-warning-500/20">
        <span className="sr-only">Replaces: </span>
        {quote || "The commented text was removed."}
      </div>
      <div className="bg-success-100/60 px-2 py-1 dark:bg-success-500/20">
        <span className="sr-only">With: </span>
        {suggestion ? (
          renderBody(suggestion)
        ) : (
          <span className="text-xs text-muted-foreground">
            Deletes the text.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="px-2 py-1 text-xs text-warning-500">
          {error}
        </p>
      )}
    </div>
  );
};

interface MessageBodyProps {
  body: string;
  quote: string | undefined;
  renderBody: (body: string) => ReactNode;
  onApplySuggestion?: (suggestion: string) => Result<void, string>;
}

/**
 * @cc [owner:tdraier,label:react] document-comment-message-body
 * A message MUST render its text and each of its suggestions where they stand in the body, each
 * suggestion as its own card, applying its own text.
 */
const MessageBody = ({
  body,
  quote,
  renderBody,
  onApplySuggestion,
}: MessageBodyProps) => {
  const parts = useMemo(() => {
    const read = readMessageSuggestions(body);
    return read.isOk() && read.value
      ? read.value.map((part) => ({
          ...part,
          applicable:
            part.kind === "suggestion" &&
            parseInlineMarkdown(part.suggestion).isOk(),
        }))
      : null;
  }, [body]);
  if (!parts) {
    return renderBody(body);
  }
  return (
    <>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <Fragment key={`text-${index}`}>{renderBody(part.text)}</Fragment>
        ) : (
          <SuggestionCard
            key={`suggestion-${index}`}
            quote={quote}
            suggestion={part.suggestion}
            renderBody={renderBody}
            onApply={
              onApplySuggestion && part.applicable
                ? () => onApplySuggestion(part.suggestion)
                : undefined
            }
          />
        )
      )}
    </>
  );
};

interface ReplyComposerProps {
  author: DfmAuthor | undefined;
  renderAuthorAvatar: RenderAuthorAvatar;
  onReply: (body: string) => Promise<Result<void, string>>;
  /** Escape clears the field and hands focus back to the thread. */
  onCancel: () => void;
  onSuggest?: () => Result<string, string>;
  mountPortalContainer?: HTMLElement;
}

const ReplyComposer = ({
  author,
  renderAuthorAvatar,
  onReply,
  onCancel,
  onSuggest,
  mountPortalContainer,
}: ReplyComposerProps) => {
  const { t } = useLingui();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  return (
    <DocumentCommentInput
      label={t`Reply`}
      placeholder={t`Reply…`}
      author={author}
      renderAuthorAvatar={renderAuthorAvatar}
      value={body}
      onChange={setBody}
      onSubmit={async (trimmed) => {
        setSending(true);
        let replied: Result<void, string>;
        try {
          replied = await onReply(trimmed);
        } finally {
          setSending(false);
        }
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
      pending={sending}
      onSuggest={onSuggest}
      mountPortalContainer={mountPortalContainer}
      className="-mb-1 border-t border-border pt-2"
    />
  );
};

interface DraftCardProps {
  author: DfmAuthor;
  renderAuthorAvatar: RenderAuthorAvatar;
  quote: string;
  /** The panel is visible, so the field can take focus. */
  visible: boolean;
  onSubmit: (body: string) => Promise<Result<void, string>>;
  onCancel: () => void;
  onSuggest?: () => Result<string, string>;
  mountPortalContainer?: HTMLElement;
}

const DraftCard = ({
  author,
  renderAuthorAvatar,
  quote,
  visible,
  onSubmit,
  onCancel,
  onSuggest,
  mountPortalContainer,
}: DraftCardProps) => {
  const { t } = useLingui();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (visible) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [visible]);

  return (
    <article
      ref={ref}
      aria-label={t`New comment`}
      className="flex flex-col gap-2.5 rounded-xl border border-golden-500/60 bg-background p-3 ring-1 ring-golden-500/40"
    >
      <p className="line-clamp-2 rounded-r-md border-l-2 border-golden-400 py-0.5 pl-2 text-xs text-muted-foreground">
        <span className="sr-only">{t`Commented text:`} </span>
        {quote}
      </p>
      <DocumentCommentInput
        label={t`Comment`}
        placeholder={t`Add a comment…`}
        author={author}
        renderAuthorAvatar={renderAuthorAvatar}
        value={body}
        onChange={setBody}
        onSubmit={async (trimmed) => {
          setSending(true);
          let submitted: Result<void, string>;
          try {
            submitted = await onSubmit(trimmed);
          } finally {
            setSending(false);
          }
          setError(submitted.isErr() ? submitted.error : null);
        }}
        onCancel={onCancel}
        error={error}
        pending={sending}
        // Hidden elements ignore focus(), so wait until the panel shows.
        autoFocus={visible}
        onSuggest={onSuggest}
        mountPortalContainer={mountPortalContainer}
      />
    </article>
  );
};

interface CommentThreadProps {
  comment: DfmComment;
  quote: string | undefined;
  active: boolean;
  canWrite: boolean;
  author: DfmAuthor | undefined;
  isVerified: (index: number) => boolean | null;
  onSelect: () => void;
  onReply: (body: string) => Promise<Result<void, string>>;
  onSetResolved: (resolved: boolean) => void;
  onDelete: () => void;
  onElement: (element: HTMLElement | null) => void;
  renderBody: (body: string) => ReactNode;
  onSuggest?: () => Result<string, string>;
  onApplySuggestion?: (suggestion: string) => Result<void, string>;
  mountPortalContainer?: HTMLElement;
  renderAuthorAvatar: RenderAuthorAvatar;
}

const CommentThread = ({
  comment,
  quote,
  active,
  canWrite,
  author,
  isVerified,
  onSelect,
  onReply,
  onSetResolved,
  onDelete,
  onElement,
  renderBody,
  onSuggest,
  onApplySuggestion,
  mountPortalContainer,
  renderAuthorAvatar,
}: CommentThreadProps) => {
  const { t } = useLingui();
  const ref = useRef<HTMLElement | null>(null);
  const [first, ...replies] = comment.messages;
  const resolved = comment.status === "resolved";
  const authorName = first.author.name;

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
      aria-label={t`Comment by ${authorName}`}
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
          <MessageByline
            message={first}
            size="xxs"
            renderAuthorAvatar={renderAuthorAvatar}
            verified={isVerified(0)}
            mountPortalContainer={mountPortalContainer}
          />
          {canWrite && (
            <div className="-mr-1.5 flex shrink-0">
              <PanelIconButton
                label={resolved ? t`Reopen` : t`Resolve`}
                icon={resolved ? ReverseLeft : Check}
                onClick={() => onSetResolved(!resolved)}
                mountPortalContainer={mountPortalContainer}
              />
              <PanelIconButton
                label={t`Delete comment`}
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
          <span className="sr-only">{t`Commented text:`} </span>
          {quote || t`The commented text was removed.`}
        </button>
        <MessageBody
          body={first.body}
          quote={quote}
          renderBody={renderBody}
          onApplySuggestion={onApplySuggestion}
        />
        {replies.length > 0 && (
          <ul className="flex flex-col gap-2.5 border-l border-border pl-3">
            {replies.map((reply, index) => (
              <li
                key={`${reply.createdAt}:${index}`}
                className="flex flex-col gap-1"
              >
                <MessageByline
                  message={reply}
                  size="3xs"
                  renderAuthorAvatar={renderAuthorAvatar}
                  verified={isVerified(index + 1)}
                  mountPortalContainer={mountPortalContainer}
                />
                <MessageBody
                  body={reply.body}
                  quote={quote}
                  renderBody={renderBody}
                  onApplySuggestion={onApplySuggestion}
                />
              </li>
            ))}
          </ul>
        )}
        {canWrite && active && !resolved && (
          <ReplyComposer
            author={author}
            renderAuthorAvatar={renderAuthorAvatar}
            onReply={onReply}
            onCancel={() => ref.current?.focus()}
            onSuggest={onSuggest}
            mountPortalContainer={mountPortalContainer}
          />
        )}
      </div>
    </article>
  );
};

interface DocumentCommentsPanelProps {
  id: string;
  comments: DocumentCommentsController;
  renderCommentBody: (body: string) => ReactNode;
  mountPortalContainer?: HTMLElement;
  renderAuthorAvatar: RenderAuthorAvatar;
}

/** The thread to focus after removing one from its list: the next, else the previous. */
const neighbourId = (list: DfmComment[], id: string): string | null => {
  const index = list.findIndex((comment) => comment.id === id);
  return (list[index + 1] ?? list[index - 1])?.id ?? null;
};

/**
 * @cc [owner:tdraier,label:react] document-comment-draft-card
 * While a draft is pending and the user can comment, the panel MUST show a new comment card
 * among the open threads at the draft's place in document order, with its field focused once
 * the panel is visible. Escape in the field and closing the panel MUST cancel the draft; a
 * pointer press elsewhere MUST NOT, so typed text survives a stray click. Enter MUST submit the
 * trimmed text. A refused submission MUST keep the typed text and show the reason.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comments-panel
 * The panel MUST list open threads in document order, then resolved threads in a collapsed
 * group. Reply and moderation controls MUST render only when canWrite, and replies only on the
 * active open thread. Escape inside a reply field MUST clear it and return focus to its
 * thread, not close the panel. After resolving, reopening or deleting a thread, focus MUST
 * move to a neighbouring thread or to the panel heading. Opening or closing the panel MUST NOT
 * change the document.
 */
/**
 * @cc [owner:tdraier,label:react;performance] document-comments-panel-avatars
 * The host's `renderAuthorAvatar` MUST NOT be called before the panel first opens, so avatars
 * that load data do not load it for a panel the user never opens; until then bylines MUST show
 * no avatar. Once opened, avatars MUST stay rendered, so closing does not drop them mid-slide.
 */
export const DocumentCommentsPanel = ({
  id,
  comments,
  renderCommentBody,
  mountPortalContainer,
  renderAuthorAvatar,
}: DocumentCommentsPanelProps) => {
  const { t } = useLingui();
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
    draft,
    draftQuote,
    starts,
    submitDraft,
    cancelDraft,
    isVerified,
    suggestable,
    draftSuggestable,
    suggestionTemplate,
    draftSuggestionTemplate,
    applySuggestion,
  } = comments;
  const [hasOpened, setHasOpened] = useState(panelOpen);
  if (panelOpen && !hasOpened) {
    setHasOpened(true);
  }
  const renderVisibleAvatar = hasOpened ? renderAuthorAvatar : renderNoAvatar;
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
  // Threads whose text was removed have no start and stay after the draft.
  const draftIndex = draft
    ? unresolved.filter(
        (comment) =>
          (starts.get(comment.id) ?? Number.MAX_SAFE_INTEGER) < draft.from
      ).length
    : -1;

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
    const canSuggest =
      canWrite && comment.status === "open" && suggestable.has(comment.id);
    return (
      <CommentThread
        key={comment.id}
        comment={comment}
        quote={quotes.get(comment.id)}
        active={comment.id === activeId}
        canWrite={canWrite}
        author={author}
        isVerified={(index) => isVerified(comment.id, index)}
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
        renderAuthorAvatar={renderVisibleAvatar}
        renderBody={renderCommentBody}
        onSuggest={
          canSuggest ? () => suggestionTemplate(comment.id) : undefined
        }
        onApplySuggestion={
          canSuggest
            ? (suggestion) =>
                applySuggestion(
                  comment.id,
                  suggestion,
                  neighbourId(siblings, comment.id)
                )
            : undefined
        }
        mountPortalContainer={mountPortalContainer}
      />
    );
  };

  return (
    <aside
      id={id}
      ref={panelRef}
      aria-label={t`Comments`}
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
            unresolvedCount > 0
              ? t`Comments, ${plural(unresolvedCount, { one: "# unresolved", other: "# unresolved" })}`
              : t`Comments`
          }
          className="rounded-md text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trans>Comments</Trans>
          {unresolved.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {unresolved.length}
            </span>
          )}
        </h2>
        <PanelIconButton
          label={t`Close comments`}
          icon={XClose}
          onClick={closePanel}
          mountPortalContainer={mountPortalContainer}
        />
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {threads.length === 0 && !draft && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            <Icon visual={MessageTextCircle01} size="md" />
            <p className="text-sm font-medium text-foreground">
              <Trans>No comments yet</Trans>
            </p>
            <p className="text-xs">
              <Trans>
                Select some text and choose Comment to start a thread.
              </Trans>
            </p>
          </div>
        )}
        {unresolved.slice(0, Math.max(draftIndex, 0)).map(renderThread)}
        {draft && author && (
          <DraftCard
            author={author}
            renderAuthorAvatar={renderVisibleAvatar}
            quote={draftQuote}
            visible={panelOpen}
            onSubmit={submitDraft}
            onCancel={cancelDraft}
            onSuggest={draftSuggestable ? draftSuggestionTemplate : undefined}
            mountPortalContainer={mountPortalContainer}
          />
        )}
        {unresolved.slice(Math.max(draftIndex, 0)).map(renderThread)}
        {resolved.length > 0 && (
          <Collapsible className="mt-1">
            <CollapsibleTrigger
              variant="secondary"
              label={t`Resolved (${resolvedCount})`}
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
  const { t } = useLingui();
  const unresolvedCount = comments.unresolved.length;
  return (
    <Button
      ref={comments.toggleRef}
      type="button"
      variant="ghost"
      size="xs"
      icon={MessageTextCircle01}
      label={t`Comments`}
      aria-label={
        unresolvedCount > 0
          ? t`Comments, ${plural(unresolvedCount, { one: "# unresolved", other: "# unresolved" })}`
          : t`Comments`
      }
      isCounter={unresolvedCount > 0}
      counterValue={String(unresolvedCount)}
      aria-expanded={comments.panelOpen}
      aria-controls={panelId}
      onClick={comments.togglePanel}
    />
  );
};
